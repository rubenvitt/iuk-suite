// @vitest-environment jsdom
// src/app/m/radio/_ui/RueckgabeListe.test.tsx
import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * DIE LISTE DER OFFENEN AUSLEIHEN (Spec 1 §4.4 Schritte 1, 2 und 6, `:3556-3563`).
 *
 * ⛔ DIESE DATEI STEHT NICHT IN DER DATEILISTE DES PLANS, UND SIE MUSS ES. `briefs/A20.md:3-5`
 * fuehrt fuer diese Aufgabe nur `rueckgabe/page.test.tsx` und `_ui/RueckgabeDialog.test.tsx`,
 * legt aber `_ui/RueckgabeListe.tsx` an und verlangt in seiner Testtafel die zwei Aussagen
 * „sucht ueber Rufname UND Entleihername" und „zeigt die Suchzeile nicht bei leerer Liste" —
 * beide gehoeren zu DIESER Insel. Der Praezedenzfall ist benannt: `VORABSCAN-A.md:106` fuehrt
 * fuer A19 denselben Befund als **F19** („`_ui/EntleiherFeld.tsx` wird ohne Testdatei
 * angelegt, aber die zweite Testtabelle fuehrt zwei EntleiherFeld-Aussagen — welche Datei sie
 * traegt, sagt der Brief nicht").
 * ⛔ IN `page.test.tsx` KOENNEN SIE NICHT STEHEN: dort ist diese Insel eine Attrappe (die
 * Seite ist eine async Server Component), und eine Attrappe sucht nicht.
 *
 * ⛔ DER DIALOG IST HIER EINE ATTRAPPE, die ihre Props als Attribute an den GERENDERTEN Baum
 * haengt und ihre zwei Rueckmeldungen als Knoepfe anbietet — dieselbe Bauart wie
 * `(ausleihe)/ausleihen/page.test.tsx:80-99`. Sein eigenes Verhalten hat
 * `_ui/RueckgabeDialog.test.tsx`; hier wird die VERDRAHTUNG gemessen.
 */
vi.mock("./RueckgabeDialog", () => ({
  RueckgabeDialog: (p: {
    ausleihe: { id: string; rufname: string };
    offen: boolean;
    onSchliessen: () => void;
    onErledigt: (rufname: string) => void;
  }) => (
    <div
      data-rolle="radio-dialog-attrappe"
      data-id={p.ausleihe.id}
      data-rufname={p.ausleihe.rufname}
      data-offen={String(p.offen)}
    >
      <button type="button" data-rolle="attrappe-erledigt" onClick={() => p.onErledigt("41/12")} />
      <button type="button" data-rolle="attrappe-schliessen" onClick={() => p.onSchliessen()} />
    </div>
  ),
}));

import { mount, unmount, query, queryAll, exists, fill, click } from "@/app/m/qr/_lib/test-dom";
import { RueckgabeListe, type ListenAusleihe } from "./RueckgabeListe";

const SUCHE = "[data-rolle='radio-rueckgabe-suche']";
const KARTE = "[data-rolle='radio-leihkarte']";
const LEER_TREFFER = "[data-rolle='radio-rueckgabe-leer-treffer']";
const ERFOLG = "[data-rolle='radio-rueckgabe-erfolg']";
const DIALOG = "[data-rolle='radio-dialog-attrappe']";

const karte = (id: string): string => `${KARTE}[data-id='${id}']`;

const DREI: ListenAusleihe[] = [
  { id: "l-1", rufname: "41/12", entleiher: "Anna Beispiel", seitText: "14.06.2026, 09:12" },
  { id: "l-2", rufname: "41/13", entleiher: "Björn Müller", seitText: "14.06.2026, 10:30" },
  { id: "l-3", rufname: "Wache 7", entleiher: "Carla Cordes", seitText: "13.06.2026, 18:05" },
];

async function rendere(ausleihen: ListenAusleihe[] = DREI): Promise<void> {
  await mount(<RueckgabeListe ausleihen={ausleihen} />);
}

const rufnamen = (): string[] =>
  queryAll(KARTE).map((k) => k.getAttribute("data-rufname") ?? "");

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

describe("radio-RueckgabeListe: die Karten", () => {
  it("zeigt Rufname und Ausleihzeitpunkt, und der Rufname steht zuerst", async () => {
    /*
     * §4.4 Schritt 1 (Spec:3558): „die Liste der offenen Ausleihen als Karten: Rufname fett,
     * darunter ‚Ausgeliehen am 14.06.2026, 09:12 Uhr'" — 1:1 aus
     * `radio-inventar/apps/frontend/src/components/features/LoanedDeviceCard.tsx:59-64`.
     * ⛔ DAS WORT „Uhr" HAENGT AM AUFRUFORT und nicht in `datumMitUhrzeit`
     * (`_lib/anzeige.ts:52-58` schreibt genau das aus) — sonst stuende an jedem zweiten Ort
     * „Uhr Uhr".
     * ⛔ UND `seitText` IST EINE FERTIGE ZEICHENKETTE VOM SERVER (§4.1 Punkt 1,
     * `_db/leihen.ts:104-109`): kein `Date` ueberquert die RSC-Grenze.
     */
    await rendere();
    const erste = query(karte("l-1"));
    expect(query(`${karte("l-1")} [data-rolle='radio-leihkarte-rufname']`).textContent).toBe("41/12");
    expect(erste.textContent).toContain("Ausgeliehen am 14.06.2026, 09:12 Uhr");
    expect(rufnamen()).toEqual(["41/12", "41/13", "Wache 7"]);
  });

  it("ist je Karte EIN Bedienelement mit einer sprechenden Beschriftung", async () => {
    /*
     * ⛔ EIN ECHTER `<button>`, KEIN `div` MIT `role="button"`. Der Bestand baut das zweite
     * (`LoanedDeviceCard.tsx:53-56`: `role`, `tabIndex`, eigener `onKeyDown` fuer Enter und
     * Leertaste) — ein Nachbau dessen, was ein `<button>` mitbringt. Das Ledger bindet die
     * Auswahlflaechen dieses Moduls auf EIN Bedienmodell
     * (`.superpowers/sdd/planteil3/progress.md:675-684`), und A19 hat dieselbe Wahl schon
     * getroffen (`_ui/AusleihVorgang.tsx:332-345`).
     * ⛔ DIE BESCHRIFTUNG NENNT DEN VORGANG, nicht nur den Rufnamen (`:55`: „`${callSign}`
     * zurueckgeben") — „41/12" allein sagt einer Bildschirmleserin nicht, was ein Antippen tut.
     * ⛔ `type="button"`: die Karten stehen zwar in keinem Formular, aber der Dialog bringt
     * eines mit; ein Vorgabetyp `submit` waere eine Wanze auf Abruf.
     */
    await rendere();
    const erste = query<HTMLButtonElement>(karte("l-1"));
    expect(erste.tagName).toBe("BUTTON");
    expect(erste.getAttribute("type")).toBe("button");
    expect(erste.getAttribute("aria-label")).toBe("41/12 zurückgeben");
  });

  it("oeffnet beim Antippen den Dialog fuer GENAU diese Ausleihe", async () => {
    /*
     * §4.4 Schritt 3 (Spec:3560): „Er tippt eine Karte an. Ein Dialog oeffnet: ‚41/12
     * zurueckgeben'". ⛔ VOR DEM ANTIPPEN GIBT ES KEINEN DIALOG: der Bestand rendert ihn
     * ebenfalls erst mit einer Auswahl (`routes/return.tsx:96`), und ein dauerhaft
     * gemounteter Dialog fuehrte ein Notizfeld ohne Gegenstand.
     * ⛔ UND KEINE MEHRFACH-RUECKGABE (§4.9.6, `briefs/A20.md:19-20`): eine Karte, ein
     * Dialog, eine Ausleihe. Der zweite Antipp ERSETZT die Auswahl, er sammelt nicht.
     */
    await rendere();
    expect(exists(DIALOG), "ohne Antippen kein Dialog").toBe(false);

    await click(karte("l-2"));

    expect(query(DIALOG).getAttribute("data-id")).toBe("l-2");
    expect(query(DIALOG).getAttribute("data-rufname")).toBe("41/13");
    expect(query(DIALOG).getAttribute("data-offen")).toBe("true");
    expect(queryAll(DIALOG).length, "eine Karte, ein Dialog").toBe(1);

    await click(karte("l-3"));
    expect(query(DIALOG).getAttribute("data-id"), "der zweite Antipp ERSETZT").toBe("l-3");
    expect(queryAll(DIALOG).length).toBe(1);
  });
});

describe("radio-RueckgabeListe: die Suchzeile", () => {
  it("sucht ueber Rufname UND Entleihername", async () => {
    /*
     * ⛔ FALLE № 10 DER ANALYSE (`docs/radio-portierung-analyse.md:1370-1374`): in der
     * Rueckgabe wird ueber Rufname UND Entleihername gesucht, in der Uebersicht ueber ganz
     * andere Felder. Die reine Funktion ist `filtereAusleihen` (`_lib/filter.ts`) und dort
     * eigens bewacht; DIESER Fall belegt, dass die Insel sie ueberhaupt benutzt — eine Insel
     * mit eigener, engerer Suche waere typkorrekt und liesse jene Faelle gruen.
     * ⛔ UND ER MISST BEIDE FELDER, nicht eines: eine Suche nur ueber den Rufnamen bestuende
     * die erste Haelfte.
     */
    await rendere();

    await fill(SUCHE, "41/13");
    expect(rufnamen()).toEqual(["41/13"]);

    await fill(SUCHE, "cordes");
    expect(rufnamen(), "der Entleihername findet ebenso").toEqual(["Wache 7"]);

    await fill(SUCHE, "");
    expect(rufnamen()).toEqual(["41/12", "41/13", "Wache 7"]);
  });

  it("zeigt die Suchzeile nicht bei leerer Liste", async () => {
    /*
     * §4.4 Schritt 2 (Spec:3559): „Die Suchzeile erscheint heute nur bei `loans.length > 0`
     * (`routes/return.tsx:60`); das bleibt." Ein Suchfeld ueber nichts ist eine Bedienflaeche
     * ohne Gegenstand — dieselbe Entscheidung, die A18 fuer die Filterleiste getroffen hat
     * (`(ausleihe)/geraete/page.tsx`: bei leerem Bestand erscheint die Insel gar nicht).
     *
     * ⚠️ DIE BEDINGUNG PRUEFT DIE UNGEFILTERTE LISTE, und das ist der Unterschied zum Fall
     * darunter: der Bestand haengt die Suchzeile an `loans` (`routes/return.tsx:60`), den
     * Leerzustand aber an die GEFILTERTE Liste (`LoanedDeviceList.tsx:54`). Wer beide an
     * dieselbe Liste haengte, naehme mit dem letzten Treffer auch das Feld weg, in das man
     * gerade getippt hat.
     * ⚠️ UEBER `page.tsx` IST DIESER FALL NICHT ERREICHBAR — dort steht bei leerer Liste ein
     * antd `Empty` an der Stelle der Insel (`briefs/A20.md:15`), die Insel wird also gar
     * nicht erst gerendert. Die Bedingung ist von der Seite aus DEFENSIV; sie steht hier,
     * weil sie die Zusage des Bestands woertlich traegt und weil die Insel den zweiten
     * Aufrufer nicht kennt.
     */
    await rendere([]);

    expect(exists(SUCHE)).toBe(false);
    expect(queryAll(KARTE).length).toBe(0);

    await unmount();
    await rendere();
    expect(exists(SUCHE), "mit Ausleihen steht sie da").toBe(true);
  });

  it("nennt den Suchtext, wenn nichts mehr passt", async () => {
    /*
     * ⛔ ZWEI LAGEN, ZWEI SAETZE — dieselbe Trennung wie auf der Uebersicht
     * (`_ui/GeraeteListe.tsx:165-179`) und im Ausleihvorgang: „Keine Geraete ausgeliehen"
     * gilt fuer die leere Liste und steht als antd `Empty` auf der SEITE; hier gibt es
     * Ausleihen, nur keinen Treffer.
     * ⛔ DER SATZ NENNT DEN SUCHTEXT (`DeviceGroupedList.tsx:22`): „Keine Treffer" ueber
     * einer vollen Liste laesst niemanden erkennen, warum.
     * ⛔ UND DIE SUCHZEILE BLEIBT DABEI STEHEN — sonst gaebe es keinen Weg zurueck.
     */
    await rendere();

    await fill(SUCHE, "zeppelin");

    expect(queryAll(KARTE).length).toBe(0);
    expect(query(LEER_TREFFER).textContent).toContain("zeppelin");
    expect(exists(SUCHE), "das Feld bleibt, sonst gibt es keinen Weg zurueck").toBe(true);
  });
});

describe("radio-RueckgabeListe: der Erfolg und das Schliessen", () => {
  it("meldet den Erfolg oben, mit dem Rufnamen aus dem Dialog", async () => {
    /*
     * §4.4 Schritt 5 (Spec:3562): „Der Dialog schliesst, die Karte verschwindet, oben steht
     * ‚41/12 zurueckgegeben.'"
     * ⛔ KEIN TOAST (Entscheidung E6, Spec:3754-3776): in `src/app` gibt es keinen Aufruf von
     * `message.*` oder `App.useApp()`; der Alt-Kiosk benutzt `sonner`
     * (`routes/return.tsx:43`), das hier nicht existiert.
     * ⛔ UND KEIN ERGEBNISPARAMETER IN DER ADRESSE wie bei der Ausleihe
     * (`/geraete?gebucht=<n>`): `rueckgabeBuchen` leitet ausdruecklich NICHT um, damit die
     * getippte Notiz einen Fehlerschluss ueberlebt (`_actions/ausleihe.ts:190-197`). Der Satz
     * lebt deshalb im Zustand dieser Insel.
     * ⛔ `role="status" aria-live="polite"` UND NICHT `alert`: das Ruling
     * (`.superpowers/sdd/planteil3/progress.md:603-634`) regelt ausdruecklich
     * FEHLER-Meldungsorte, und dies ist eine BESTAETIGUNG. A19 hat denselben Fall an seinem
     * Erfolgssatz genauso entschieden (`_ui/SitzungErneuern.tsx:120-124`); zwei Toene fuer
     * dieselbe Sache waeren genau das, was die A11-Zeile verhindern soll.
     */
    await rendere();
    await click(karte("l-1"));
    await click("[data-rolle='attrappe-erledigt']");

    expect(query(ERFOLG).textContent).toBe("41/12 zurückgegeben.");
    expect(query(ERFOLG).getAttribute("role")).toBe("status");
    expect(query(ERFOLG).getAttribute("aria-live")).toBe("polite");
    expect(exists(DIALOG), "nach dem Erfolg ist der Dialog fort").toBe(false);
  });

  it("laesst den Dialog nach dem Schliessen GEMOUNTET, nur zu", async () => {
    /*
     * ⛔ DIESE ZEILE TRAEGT FEINHEIT 1 (Spec:3576-3580). Der Bestand haelt `selectedLoan`
     * ueber das Schliessen hinweg und setzt nur `isDialogOpen` zurueck
     * (`routes/return.tsx:44-45` gegen `:100`); dadurch bleibt der Dialog GEMOUNTET, und der
     * Wechsel auf eine andere Ausleihe laeuft durch den Ruecksetz-Effekt statt durch einen
     * Neuaufbau. ⛔ WER IHN BEIM SCHLIESSEN ABRAEUMT, macht den Fall „leert die Notiz beim
     * Wechsel" (`_ui/RueckgabeDialog.test.tsx`) konstruktiv gruen: ein frischer Baum hat
     * ohnehin ein leeres Feld.
     * ⚠️ NACH DEM ERFOLG IST DAS ANDERS UND SOLL ES SEIN (Fall darueber): dort raeumt auch
     * der Bestand beides ab (`:44-45`), weil die Leihzeile nicht mehr existiert.
     */
    await rendere();
    await click(karte("l-1"));
    await click("[data-rolle='attrappe-schliessen']");

    expect(exists(DIALOG), "gemountet bleibt er").toBe(true);
    expect(query(DIALOG).getAttribute("data-offen")).toBe("false");

    await click(karte("l-2"));
    expect(query(DIALOG).getAttribute("data-offen"), "und oeffnet wieder").toBe("true");
    expect(query(DIALOG).getAttribute("data-id")).toBe("l-2");
  });

  it("nimmt den Erfolgssatz zurueck, sobald der naechste Vorgang beginnt", async () => {
    /*
     * ⛔ EIN SATZ UEBER EINEN ABGESCHLOSSENEN VORGANG DARF NICHT UEBER DEM NAECHSTEN STEHEN
     * BLEIBEN. Der Alt-Kiosk hat das Problem nicht, weil sein Toast von selbst verschwindet
     * (`routes/return.tsx:43`); ein Satz im Baum tut das nicht. Ohne diese Ruecknahme laese
     * eine Person „41/12 zurueckgegeben." ueber einem Dialog zu 41/13.
     */
    await rendere();
    await click(karte("l-1"));
    await click("[data-rolle='attrappe-erledigt']");
    expect(exists(ERFOLG)).toBe(true);

    await click(karte("l-2"));

    expect(exists(ERFOLG)).toBe(false);
  });
});
