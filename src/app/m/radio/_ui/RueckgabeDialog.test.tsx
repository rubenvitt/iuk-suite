// @vitest-environment jsdom
// src/app/m/radio/_ui/RueckgabeDialog.test.tsx
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";

/**
 * DER RUECKGABEDIALOG (Spec 1 §4.4, `:3554-3594`).
 *
 * ⛔ ZWEI ACTION-MODULE WERDEN ERSETZT, aus demselben Grund wie in
 * `_ui/AusleihVorgang.test.tsx:9-15`: `_actions/ausleihe.ts` und `_actions/sitzung.ts`
 * tragen `"use server"` und ziehen `next/cache`, `next/headers`, die Gate-Schranke und die
 * Moduldatenbank nach. Der Dialog braucht sie als REFERENZEN; WAS sie tun, gehoert A9 und
 * A17.
 *
 * ⛔ WAS HIER NICHT GEMOCKT IST, IST ABSICHT: `_lib/meldungen.ts` laeuft ECHT (die Saetze
 * und `ZUSTANDSNOTIZ_MAX`), und `_ui/SitzungErneuern.tsx` ebenfalls — die Zusage §3.10 Nr. 8
 * haengt daran, dass die ECHTE Insel ihre eigene Bedingung `grund === "sitzung"` faellt
 * (`_ui/SitzungErneuern.tsx:97`). Eine Attrappe machte den Fall „erscheint NICHT bei
 * gesperrt" zu einer Aussage ueber die Attrappe.
 *
 * ⛔ DIE ABFRAGEN LAUFEN UEBER `queryPortal`, NICHT UEBER `query`: antds `Modal` rendert
 * durch ein PORTAL an `document.body` (`@/app/m/qr/_lib/test-dom:174-186`), der Inhalt ist
 * also ein GESCHWISTER des Mount-Wirts und kein Nachfahre. Ein `query()` faende ihn nie.
 */
const rueckgabeBuchenMock = vi.hoisted(() => vi.fn());
const erneuereSitzungMock = vi.hoisted(() => vi.fn());

vi.mock("../_actions/ausleihe", () => ({ rueckgabeBuchen: rueckgabeBuchenMock }));
vi.mock("../_actions/sitzung", () => ({ erneuereSitzung: erneuereSitzungMock }));

import { mount, unmount, rerender, queryPortal, existsPortal, clickPortal } from "@/app/m/qr/_lib/test-dom";
import { ZUSTANDSNOTIZ_MAX } from "../_lib/meldungen";
import { RueckgabeDialog, type DialogAusleihe } from "./RueckgabeDialog";

const STYLESHEET = "src/app/m/radio/_ui/ausleihe.module.css";
const FORMULAR = "[data-rolle='radio-rueckgabeform']";
const NOTIZ = "#radio-zustandsnotiz";
const ZAEHLER = ".ant-input-data-count";
const SENDEN = "[data-rolle='radio-rueckgabe-senden']";
const ABBRECHEN = "[data-rolle='radio-rueckgabe-abbrechen']";
const FEHLER = "[data-rolle='radio-rueckgabe-fehler']";
const NOTIZFEHLER = "[data-rolle='radio-notiz-fehler']";
const ERNEUERN = "[data-rolle='radio-sitzung-erneuern']";
const AUSLEIHE_ID = "[data-rolle='radio-ausleihe-id']";

/**
 * ⛔ DIE SAETZE STEHEN AUSGESCHRIEBEN und werden nicht aus `_lib/meldungen.ts` importiert:
 * sonst richtete sich die Zusicherung gegen denselben Wert, den der Dialog rendert, und
 * koennte konstruktiv nie fehlschlagen (dieselbe Form wie
 * `_ui/AusleihVorgang.test.tsx:57-62`).
 */
const SATZ_SCHON_ZURUECK = "41/12 wurde zwischenzeitlich von jemand anderem zurückgegeben.";
const SATZ_SITZUNG =
  "Dein Zugang ist abgelaufen. Gib den Code erneut ein — deine Eingaben bleiben stehen.";
const SATZ_GESPERRT = "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.";

const EINS: DialogAusleihe = { id: "l-1", rufname: "41/12" };
const ZWEI: DialogAusleihe = { id: "l-2", rufname: "41/13" };

const schliessen = vi.fn();
const erledigt = vi.fn();

async function rendere(ausleihe: DialogAusleihe = EINS, offen = true): Promise<void> {
  await mount(
    <RueckgabeDialog
      ausleihe={ausleihe}
      offen={offen}
      onSchliessen={schliessen}
      onErledigt={erledigt}
    />,
  );
}

async function erneutRendern(ausleihe: DialogAusleihe, offen = true): Promise<void> {
  await rerender(
    <RueckgabeDialog
      ausleihe={ausleihe}
      offen={offen}
      onSchliessen={schliessen}
      onErledigt={erledigt}
    />,
  );
}

/**
 * `fill` und `submitForm` aus dem Harness suchen im WIRT (`test-dom:109-112`) und finden im
 * Portal nichts. Diese zwei Helfer sind zeichengleich zu ihnen, nur mit `queryPortal`.
 */
async function fuelle(selektor: string, wert: string): Promise<void> {
  const feld = queryPortal<HTMLTextAreaElement>(selektor);
  const setzer = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")?.set;
  if (!setzer) throw new Error(`Kein value-Setter am Prototyp von ${feld.tagName}`);
  await act(async () => {
    setzer.call(feld, wert);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/**
 * ⛔ DIREKT AM FORMULAR UND NICHT UEBER DEN KNOPF — dieselbe Begruendung wie in
 * `test-dom:162-166`: ein deaktivierter Knopf verschluckte das Ereignis, und genau dann
 * muss der Riegel im Code greifen.
 */
async function absenden(): Promise<void> {
  const formular = queryPortal<HTMLFormElement>(FORMULAR);
  await act(async () => {
    formular.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
}

beforeEach(() => {
  rueckgabeBuchenMock.mockResolvedValue({ ok: true, rufname: "41/12" });
  erneuereSitzungMock.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

describe("radio-RueckgabeDialog: die drei Feinheiten des Bestands", () => {
  it("behaelt die Notiz, wenn die Rueckgabe an einem Konflikt scheitert", async () => {
    /*
     * ⛔ DER WICHTIGSTE FALL DIESER AUFGABE (Feinheit 1, Spec:3576-3580, Alt-Quelle
     * `ReturnDialog.tsx:66-73` mit dem Kommentar „FIX H3 + M1: Only reset note on explicit
     * cancel or success — NOT on error-close (dialog stays open)").
     * ⛔ EIN NAIVER PORT SCHLIESST BEI JEDEM ERGEBNIS, und der Mensch tippt die Notiz
     * erneut. Gemessen wird deshalb DREIERLEI an einer Stelle: der Dialog meldet dem
     * Aufrufer NICHTS (weder `onErledigt` noch `onSchliessen`), das Feld traegt den
     * getippten Text unveraendert, und der Satz des Servers steht daneben.
     */
    rueckgabeBuchenMock.mockResolvedValue({
      ok: false,
      grund: "schon-zurueck",
      text: SATZ_SCHON_ZURUECK,
    });
    await rendere();

    await fuelle(NOTIZ, "Akku schwach, Kratzer am Gehäuse");
    await absenden();

    expect(erledigt, "ein gescheiterter Vorgang meldet keinen Erfolg").not.toHaveBeenCalled();
    expect(schliessen, "der Dialog bleibt bei ok: false OFFEN").not.toHaveBeenCalled();
    expect(queryPortal<HTMLTextAreaElement>(NOTIZ).value).toBe("Akku schwach, Kratzer am Gehäuse");
    expect(queryPortal(FEHLER).textContent).toBe(SATZ_SCHON_ZURUECK);
  });

  it("leert die Notiz beim Wechsel auf eine andere Ausleihe", async () => {
    /*
     * Feinheit 1, die andere Haelfte (`ReturnDialog.tsx:44-47`: „Reset note when loan
     * changes (H3 fix)"). Eine zu 41/12 getippte Notiz an 41/13 zu haengen waere ein
     * falscher Eintrag in der Datenbank, den niemand mehr aufloest.
     *
     * ⛔ ERNEUT RENDERN, NICHT NEU MOUNTEN (`test-dom:63-68`): ein zweites `mount` waere ein
     * frischer Baum, in dem das Feld schon deshalb leer ist, weil es gerade entstanden ist —
     * der Fall waere konstruktiv gruen und bewachte nichts. Genau deshalb bleibt der Dialog
     * beim Wechsel GEMOUNTET; der Bestand tut dasselbe (`routes/return.tsx:96-104` haelt
     * `selectedLoan` und tauscht nur die Prop).
     */
    await rendere(EINS);
    await fuelle(NOTIZ, "Antenne verbogen");
    expect(queryPortal<HTMLTextAreaElement>(NOTIZ).value).toBe("Antenne verbogen");

    await erneutRendern(ZWEI);

    expect(queryPortal<HTMLTextAreaElement>(NOTIZ).value, "die Notiz gehoert zu EINER Ausleihe").toBe("");
    expect(queryPortal(AUSLEIHE_ID).getAttribute("value")).toBe("l-2");
  });

  it("leert die Notiz auch, wenn der Mensch den Dialog selbst schliesst", async () => {
    /*
     * ⛔ ZWEI RUECKSETZ-ANLAESSE, NICHT EINER. Der Bestand setzt zurueck beim Wechsel
     * (`ReturnDialog.tsx:45-47`) UND bei jedem selbst ausgeloesten Schliessen — „Abbrechen"
     * (`:61-64`) und Escape/Klick daneben (`:70-72`). Nur beim FEHLERSCHLUSS nicht, und den
     * gibt es hier nicht, weil der Dialog dann offen bleibt.
     * ⛔ OHNE DIESEN ANLASS BLIEBE EINE VERWORFENE NOTIZ STEHEN und taeuchte beim naechsten
     * Oeffnen derselben Ausleihe wieder auf — der Wechsel-Effekt greift dort nicht, weil
     * sich `ausleihe.id` nicht geaendert hat.
     */
    await rendere(EINS);
    await fuelle(NOTIZ, "Verworfene Notiz");

    await clickPortal(ABBRECHEN);

    expect(schliessen).toHaveBeenCalledTimes(1);
    expect(queryPortal<HTMLTextAreaElement>(NOTIZ).value).toBe("");
  });

  it("zeigt den Zeichenzaehler und begrenzt das Feld auf dieselbe Zahl", async () => {
    /*
     * Feinheit 3 (Spec:3586-3587): der Zaehler ist „die EINZIGE Stelle, an der die Flaeche
     * die Grenze ueberhaupt nennt" (`ReturnDialog.tsx:98-100`). Feinheit 2 (`:93`): dasselbe
     * Mass steht als `maxLength` am Feld.
     * ⛔ DIE ZAHL KOMMT AUS `ZUSTANDSNOTIZ_MAX` (`_lib/meldungen.ts:88`, Auflage `:82-86`)
     * und wird hier nicht ausgeschrieben — zwei Anzeigen derselben Grenze sind nur harmlos,
     * solange es die Grenze einmal gibt. ⬜ A-L11 ist damit abgelesen: 500, aus
     * `radio-inventar/packages/shared/src/loan.ts:6` (`RETURN_NOTE_MAX`).
     * ⛔ „0 / 500" IST DER ANFANGSZUSTAND aus Spec:3560, nicht ein leerer Zaehler.
     */
    await rendere();

    expect(queryPortal(ZAEHLER).textContent).toBe(`0 / ${ZUSTANDSNOTIZ_MAX}`);
    expect(queryPortal<HTMLTextAreaElement>(NOTIZ).getAttribute("maxlength")).toBe(
      String(ZUSTANDSNOTIZ_MAX),
    );

    await fuelle(NOTIZ, "abc");
    expect(queryPortal(ZAEHLER).textContent).toBe(`3 / ${ZUSTANDSNOTIZ_MAX}`);
  });

  it("zaehlt dieselben Einheiten wie der Server, nicht Zeichen nach Augenmass", async () => {
    /*
     * ⛔ DIE OFFENE FRAGE DES LEDGERS, HIER GEMESSEN STATT ANGENOMMEN
     * (`.superpowers/sdd/planteil3/progress.md:584-588`, Fix-Runde 2 zu A17): „⬜ A20
     * schuldet dieselbe Frage am FELD. Ob der Zeichenzaehler der Zustandsnotiz den
     * getrimmten oder den ungetrimmten Wert zaehlt, entscheidet A20 — und die Antwort muss
     * zu `_db/leihen.ts:599` (`notiz.length`, ungetrimmt) passen. Zwei Messseiten fuer
     * dieselbe Grenze liefen sonst auseinander, und die zweite saehe man erst am Feld."
     *
     * ⛔ ZWEI HAELFTEN, BEIDE NOETIG:
     *   1. UNGETRIMMT — fuehrende und nachlaufende Leerzeichen zaehlen mit, wie
     *      `_db/leihen.ts:599` sie mitzaehlt.
     *   2. UTF-16-EINHEITEN, NICHT CODEPUNKTE — antds Vorgabestrategie ist
     *      `value => value.length` (gemessen an der installierten Fassung:
     *      `@rc-component/input@1.3.1/es/hooks/useCount.js:30`), also dieselbe Einheit wie
     *      `String#length` auf dem Server. Ein Zeichen ausserhalb der Basisebene belegt
     *      ZWEI; zaehlte antd Codepunkte, zeigte das Feld „1" und der Server rechnete mit
     *      2 — der Fall, den das Ledger „am Feld" nennt.
     */
    await rendere();

    await fuelle(NOTIZ, "  ab  ");
    expect(queryPortal(ZAEHLER).textContent, "ungetrimmt wie _db/leihen.ts:599").toBe(
      `6 / ${ZUSTANDSNOTIZ_MAX}`,
    );

    await fuelle(NOTIZ, "\u{1D11E}");
    expect(queryPortal(ZAEHLER).textContent, "UTF-16-Einheiten wie String#length").toBe(
      `2 / ${ZUSTANDSNOTIZ_MAX}`,
    );
  });

  it("weist eine zu lange Notiz ab, bevor der Server sie sieht", async () => {
    /*
     * Feinheit 2 (Spec:3583-3585, Alt-Quelle `ReturnDialog.tsx:52-55`, Kommentar woertlich:
     * „M6: Defensive validation … Defensive: should never happen due to maxLength, but be
     * safe").
     * ⛔ DIESE HAELFTE IST BEWUSST DEFENSIV UND WIRD NICHT ALS ERREICHBAR AUSGEGEBEN: das
     * `maxLength` am Feld haelt das TIPPEN und das EINFUEGEN an, und die Notiz beginnt leer
     * — anders als das Namensfeld aus A19, dessen Vorbelegung aus `weg: "suite"` die Grenze
     * ueberschreiten KANN (⬜ A-L17). Im Test ist sie erreichbar, weil ein programmatisch
     * gesetzter Wert `maxLength` nicht durchlaeuft.
     * ⛔ UND SIE ERSETZT DEN SERVER NICHT: `bucheRueckgabe` prueft erneut
     * (`_db/leihen.ts:599-601`) — „eine Regel, die nur im Client steht, ist keine Regel"
     * (Spec:3584).
     * ⚠️ ABWEICHUNG VOM BESTAND, BENANNT: die Alt-Quelle kehrt WORTLOS um (`:54: return;`).
     * Hier steht ein Satz am Feld, in derselben Form wie der Feldfehler des Namensfeldes
     * (`_ui/AusleihVorgang.tsx:423`) — ein Knopf, der nichts tut und nichts sagt, ist der
     * Fall, gegen den das Ledger beim Deckel ausdruecklich steht
     * (`.superpowers/sdd/planteil3/progress.md:603-634`, Punkt 1).
     */
    await rendere();

    await fuelle(NOTIZ, "x".repeat(ZUSTANDSNOTIZ_MAX + 1));

    expect(existsPortal(NOTIZFEHLER), "eine zu lange Notiz wird am Feld gemeldet").toBe(true);
    expect(queryPortal<HTMLButtonElement>(SENDEN).disabled).toBe(true);

    await absenden();
    expect(rueckgabeBuchenMock, "der Server sieht sie gar nicht erst").not.toHaveBeenCalled();

    await fuelle(NOTIZ, "x".repeat(ZUSTANDSNOTIZ_MAX));
    expect(existsPortal(NOTIZFEHLER), "genau auf der Grenze ist sie zulaessig").toBe(false);
    expect(queryPortal<HTMLButtonElement>(SENDEN).disabled).toBe(false);
  });
});

describe("radio-RueckgabeDialog: was er an den Aufrufer meldet", () => {
  it("meldet den Erfolg mit dem Rufnamen aus dem RUECKGABEWERT", async () => {
    /*
     * §4.4 Schritt 5 (Spec:3562): „Der Dialog schliesst, die Karte verschwindet, oben steht
     * ‚41/12 zurueckgegeben.'"
     * ⛔ DER RUFNAME KOMMT AUS DEM ERGEBNIS UND NICHT AUS DER PROP. `rueckgabeBuchen` leitet
     * ausdruecklich NICHT um, damit `rufname` aus dem Rueckgabewert erhalten bleibt
     * (`_actions/ausleihe.ts:190-197`) — der Wert des Servers ist der Schnappschuss der
     * Leihzeile (`_db/leihen.ts`), die Prop nur das, was die Liste zuletzt sah. Der Fall
     * setzt beide bewusst VERSCHIEDEN, sonst belegte er die Herkunft nicht.
     * ⛔ UND `onSchliessen` WIRD DABEI NICHT ZUSAETZLICH GERUFEN: der Erfolg IST der
     * Schliessgrund, zwei Meldungen fuer einen Vorgang liefen beim ersten Umbau auseinander.
     */
    rueckgabeBuchenMock.mockResolvedValue({ ok: true, rufname: "Wache 7" });
    await rendere(EINS);

    await absenden();

    expect(erledigt).toHaveBeenCalledTimes(1);
    expect(erledigt).toHaveBeenCalledWith("Wache 7");
    expect(schliessen).not.toHaveBeenCalled();
  });

  it("schickt Kennung und Notiz unter den Feldnamen der Action mit", async () => {
    /*
     * ⛔ DIE ZWEI FELDNAMEN SIND DIE DER ACTION (`_actions/ausleihe.ts:66-68`:
     * `FELD_AUSLEIHE_ID = "ausleiheId"`, `FELD_ZUSTANDSNOTIZ = "zustandsnotiz"`). Sie
     * stehen dort MODULPRIVAT, weil `EXPORT_FORM` (`_actions/guards.test.ts:122`) unter
     * `_actions/` kein `export const` zulaesst; die Auflage, hier dieselben zu verwenden,
     * steht ausgeschrieben (`_actions/ausleihe.ts:55-58`). Beide stehen woertlich in
     * Spec:3572.
     * ⛔ EIN FEHLENDES `name` AM NOTIZFELD IST DER STILLSTE FEHLER DIESER FLAECHE: die
     * Rueckgabe gelaenge, nur ohne Notiz — kein Tor saehe das. Deshalb wird das ATTRIBUT
     * gemessen und nicht der Rueckgabewert der Action.
     */
    await rendere(EINS);
    await fuelle(NOTIZ, "Akku schwach");

    expect(queryPortal(AUSLEIHE_ID).getAttribute("name")).toBe("ausleiheId");
    expect(queryPortal(AUSLEIHE_ID).getAttribute("value")).toBe("l-1");
    expect(queryPortal(NOTIZ).getAttribute("name")).toBe("zustandsnotiz");

    await absenden();

    const formular = rueckgabeBuchenMock.mock.calls[0]?.[1] as FormData;
    expect(formular.get("ausleiheId")).toBe("l-1");
    expect(formular.get("zustandsnotiz")).toBe("Akku schwach");
  });

  it("faengt einen Wurf der Action ab und zeigt den Satz des Moduls", async () => {
    /*
     * ⛔ DAS `catch` FAENGT DREI LAGEN MIT EINEM SATZ, zeichengleich zu
     * `_ui/AusleihVorgang.tsx:119-134`: Verbindungsabbruch beim Absenden, den Wurf von
     * `requireRadioHost` in der Riegelkette und jede echte Serverausnahme. Ohne es stiege
     * der Wurf in den Absendeweg hoch, und die Person saehe eine technische Fehlerseite
     * statt eines Satzes an ihrem Formular — mitsamt der getippten Notiz.
     * ⛔ DER SATZ WIRD NICHT NEU ERFUNDEN: `rueckgabeText({ grund: "unbekannt" })` liefert
     * genau den, den auch der Server fuer diesen Ausgang schickt. Ein zweiter Wortlaut waere
     * die Fehlerform, gegen die `_lib/bauform.test.ts:546-583` modulweit steht.
     * ⛔ UND DIE NOTIZ BLEIBT AUCH HIER STEHEN — es ist derselbe Fehlerschluss.
     */
    rueckgabeBuchenMock.mockRejectedValue(new Error("Verbindung weg"));
    await rendere();
    await fuelle(NOTIZ, "Kratzer");

    await absenden();

    expect(queryPortal(FEHLER).textContent).toContain("Die Rückgabe ist nicht gespeichert.");
    expect(queryPortal<HTMLTextAreaElement>(NOTIZ).value).toBe("Kratzer");
    expect(erledigt).not.toHaveBeenCalled();
    expect(schliessen).not.toHaveBeenCalled();
  });
});

describe("radio-RueckgabeDialog: die Inline-Erneuerung (Zusage 3.10 Nr. 8)", () => {
  it("erscheint bei grund sitzung, mit der ECHTEN Insel aus A19", async () => {
    /*
     * Entscheidung E12 (`.superpowers/sdd/planteil3/briefs/KOPF.md:675-728`) und Zusage
     * §3.10 Nr. 8 (Spec:3235-3236). ⛔ KEINE ZWEITE INSEL: `_ui/SitzungErneuern.tsx` wird
     * mitbenutzt, nicht neu gebaut (`briefs/A20.md:52-55`). Der Verlust, gegen den sie hier
     * steht, ist die getippte Zustandsnotiz — dieselbe Regel wie Feinheit 1.
     * ⛔ DIE NOTIZ MUSS DABEI STEHEN BLEIBEN, sonst ist die Erneuerung sinnlos: der ganze
     * Zweck von E12 ist „OHNE DIE EINGETRAGENEN WERTE ZU VERLIEREN" (Spec:2563-2570).
     */
    rueckgabeBuchenMock.mockResolvedValue({ ok: false, grund: "sitzung", text: SATZ_SITZUNG });
    await rendere();
    await fuelle(NOTIZ, "Akku schwach");

    await absenden();

    expect(existsPortal(ERNEUERN)).toBe(true);
    expect(queryPortal(FEHLER).textContent).toBe(SATZ_SITZUNG);
    expect(queryPortal<HTMLTextAreaElement>(NOTIZ).value, "E12: die Eingaben bleiben stehen").toBe(
      "Akku schwach",
    );
  });

  it("erscheint NICHT bei grund gesperrt", async () => {
    /*
     * ⛔ ZUSAGE §3.10 Nr. 8, DIE NEGATIVE HAELFTE (Spec:3235-3236): „die Inline-Erneuerung
     * wird NUR bei `grund === "sitzung"` angeboten, nie bei `"gesperrt"`." Bei einem
     * gesperrten Code scheitert dieselbe Eingabe genauso, und „ein Feld, das nicht helfen
     * kann, ist schlimmer als eine klare Absage" (Spec:2563-2570).
     * ⛔ DIESER FALL MISST DEN DIALOG, NICHT DIE INSEL: die Bedingung selbst steht in
     * `_ui/SitzungErneuern.tsx:97` und ist dort bewacht. Was HIER schiefgehen kann, ist die
     * Uebergabe — ein fest verdrahtetes `grund="sitzung"` statt `zustand.grund` liesse das
     * Feld bei JEDER Absage erscheinen, typkorrekt und lint-sauber.
     */
    rueckgabeBuchenMock.mockResolvedValue({ ok: false, grund: "gesperrt", text: SATZ_GESPERRT });
    await rendere();

    await absenden();

    expect(queryPortal(FEHLER).textContent).toBe(SATZ_GESPERRT);
    expect(existsPortal(ERNEUERN), "ein Feld, das nicht helfen kann").toBe(false);
  });

  it("erscheint auch bei einem fachlichen Konflikt NICHT", async () => {
    /*
     * ⛔ ZWOELF DER DREIZEHN `grund`-WERTE HABEN KEIN CODEFELD. Der Fall darueber misst nur
     * den einen Nachbarn `gesperrt`; ein `grund !== "gesperrt"` in der Uebergabe bliebe dort
     * gruen und zeigte das Feld bei den uebrigen elf. Dieser Fall nimmt den haeufigsten
     * davon.
     */
    rueckgabeBuchenMock.mockResolvedValue({
      ok: false,
      grund: "schon-zurueck",
      text: SATZ_SCHON_ZURUECK,
    });
    await rendere();

    await absenden();

    expect(existsPortal(ERNEUERN)).toBe(false);
  });
});

describe("radio-RueckgabeDialog: das Stylesheet im Portal", () => {
  it("keine Regel des Dialogs liest eine Variable, die nur ein Traeger im Wirt deklariert", async () => {
    /*
     * ⛔ DIE ERWEITERUNG, DIE A19 AUSDRUECKLICH VERLANGT HAT. `_ui/AusleihVorgang.test.tsx`
     * fuehrt denselben Fall fuer den Vorschlags-Aufklapper und schreibt dort woertlich:
     * „HEUTE IST `AutoComplete` DER EINZIGE PORTAL-BAUSTEIN DES MODULS … Kommt ein `Modal`,
     * `Tooltip` oder `Popover` dazu, faellt seine Flaeche unter dieselbe Regel — dann ist
     * dieser Fall zu ERWEITERN, nicht zu loeschen." Mit dieser Aufgabe kommt das `Modal`.
     *
     * ⛔ FALLE 2 (`CLAUDE.md:14-15`) IN IHRER STILLSTEN GESTALT: `--radio-rahmen-*` ist auf
     * `.rahmen` deklariert (`ausleihe.module.css:151-155`), `--radio-gate-*` auf `.gate`
     * (`:34-39`). Der Dialoginhalt haengt in einem Portal an `document.body` und hat KEINEN
     * von beiden als Vorfahr; die Erklaerung wuerde „invalid at computed-value time", und
     * die Farbe fiele still auf die geerbte zurueck. Kein Tor sieht das — `typecheck`,
     * `lint` und jsdom rechnen keine Kaskade.
     * ⛔ DIE KLASSEN WERDEN AUS DEM DOM AUSGELESEN, NICHT BEHAUPTET (dieselbe Bauart wie in
     * A19): Vitest bildet einen CSS-Modulschluessel auf `_<name>_<hash>` ab, daher der
     * Schnitt. ⛔ ERLAUBT SIND DORT NUR DIE SUITE-VARIABLEN AUF `:root`
     * (`src/app/globals.css:153-156`, Dunkelzweig `:160-163`) — sie sind die einzigen, die
     * JEDER Knoten des Dokuments sieht.
     */
    rueckgabeBuchenMock.mockResolvedValue({ ok: false, grund: "sitzung", text: SATZ_SITZUNG });
    await rendere();
    await absenden();

    const wurzel = queryPortal(FORMULAR);
    expect(document.body.contains(wurzel), "der Dialog haengt am Dokument").toBe(true);

    const imPortal = new Set<string>();
    for (const el of [wurzel, ...Array.from(wurzel.querySelectorAll<HTMLElement>("*"))]) {
      for (const klasse of Array.from(el.classList)) {
        const treffer = /^_([A-Za-z0-9]+)_[0-9a-z]+$/.exec(klasse);
        if (treffer) imPortal.add(treffer[1]!);
      }
    }
    expect(
      imPortal.has("erneuern"),
      "ohne die Erneuerungs-Insel misst der Fall den halben Dialog",
    ).toBe(true);
    expect(imPortal.size, "leere Klassenmenge — der Fall waere leer-gruen").toBeGreaterThan(3);

    const css = readFileSync(STYLESHEET, "utf8");
    const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const name of imPortal) {
      const anker = new RegExp(`\\.${name}(?![A-Za-z0-9_-])`);
      let koerper = "";
      for (const regel of ohneKommentare.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (anker.test(regel[1]!)) koerper += regel[2]!;
      }
      expect(koerper, `zu .${name} gibt es keine Regel — der Schnitt greift ins Leere`).not.toBe("");
      expect(
        koerper,
        `.${name} steht im PORTAL und liest eine Variable, die nur ein Traeger im Wirt deklariert (Falle 2)`,
      ).not.toMatch(/var\(--radio-(?:rahmen|gate)-/);
    }
  });
});
