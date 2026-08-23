// @vitest-environment jsdom
// src/app/m/radio/_ui/GateFormular.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * DIE VERHALTENSDECKUNG DER GATE-INSEL (Fix-Runde 1 zu A11, REVIEW-A11 Fund W2).
 *
 * ⛔ WARUM ES DIESE DATEI GEBEN MUSS. `src/app/m/radio/page.test.tsx:110-114` ersetzt
 * `GateFormular` durch eine Attrappe — richtig fuer jene Datei, deren Aussage die WEICHE
 * ist, aber damit lief bis zu dieser Runde KEINE Zeile der Insel je in einem Test. Der
 * Review hat drei Mutationen gemessen, die dabei STILL GRUEN blieben: `name="code"` zu
 * `name="kode"` samt entferntem `returnTo`-Feld, und das Aushaengen des oertlichen
 * Umschlags `amGate` (`?? {}` und `catch`) — jedes Mal `258 passed`, `typecheck` sauber.
 * Die erste Mutation macht das Gate unbenutzbar und toetet zugleich das Etiketten-Plumbing
 * aus A10 (`t/[code]/route.ts:76-84`).
 *
 * ⚠️ DAS ZWEIDATEIEN-MUSTER STAMMT AUS DEM BESTAND, UND ZWAR MIT BEIDEN HAELFTEN:
 * `src/app/m/lagerbuch/page.test.tsx:13` begruendet das Mocken der Insel woertlich damit,
 * dass „`_ui/Gate.test.tsx` es halten" — jene Datei fuehrt 21 Faelle. A11 hatte die
 * Seiten-Haelfte uebernommen und die Insel-Haelfte ausgelassen; diese Datei holt sie nach.
 *
 * ⛔ DIE ACTION WIRD GEMOCKT. `../_actions/gate` traegt `"use server"` und zieht
 * `next/headers`, die Schranke und die Moduldatenbank nach. Hier interessiert
 * ausschliesslich, WAS DIE INSEL AUS IHRER ANTWORT MACHT — Erfolg (Redirect), Abweisung,
 * Verbindungsabbruch, Serverausnahme.
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: dass das Formular OHNE JavaScript absendet. Der
 * Umschlag `amGate` ist keine Serverreferenz, und ob React daraus im Next-Betrieb ein
 * `$$FORM_ACTION`-Ziel macht, ist in Vitest strukturell nicht darstellbar (REVIEW-A11,
 * „Beobachtungen ohne Fundstatus", Posten 1). Der Posten gehoert an den Playwright-Lauf
 * vor dem Merge und ist hausweit, nicht A11-eigen — `lagerbuch/_ui/Gate.tsx:116-121` hat
 * dieselbe Bauform.
 */
vi.mock("../_actions/gate", () => ({ einloesenAmGate: vi.fn() }));
import { einloesenAmGate, type GateZustand } from "../_actions/gate";

import { mount, unmount, query, queryAll, exists, fill, submitForm } from "@/app/m/qr/_lib/test-dom";
import { GateFormular } from "./GateFormular";

/*
 * ⛔ DIE SAETZE STEHEN HIER AUSGESCHRIEBEN und werden NICHT aus der Insel oder aus
 * `_lib/gateTexte.ts` importiert: sonst richtete sich die Zusicherung gegen ein
 * selbstgebautes Literal und koennte konstruktiv nie fehlschlagen (dieselbe Form wie
 * `src/app/m/radio/page.test.tsx:36-39` und `lagerbuch/_ui/Gate.test.tsx:38-49`).
 *
 * ⚠️ `AUSNAHME_SATZ` traegt einen Umlaut, und das ist die eine benannte Ausnahme der
 * Hausregel: ein Satz, den ein Mensch auf dem Bildschirm liest, traegt seine Umlaute
 * (`.superpowers/sdd/planteil3/briefs/KOPF.md:268-272`). Ein umlautfreier Teilvergleich
 * waere die schwaechere Zusage — er liesse einen aehnlichen, falschen Satz durch.
 */
const SATZ_URL = "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.";
const SATZ_ACTION = "Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.";
const AUSNAHME_SATZ =
  "Der Code konnte nicht geprüft werden. Bitte noch einmal auf Weiter tippen — " +
  "bleibt es dabei, wende dich an die Leitung.";

const MELDUNG = "[data-rolle='gate-meldung']";

const aktion = vi.mocked(einloesenAmGate);

beforeEach(() => {
  aktion.mockReset();
});

afterEach(async () => {
  await unmount();
});

describe("GateFormular — der EINE Meldungsort", () => {
  it("zeigt den serverseitig gebauten Satz", async () => {
    // Der Prop ist der Rueckgabewert von `gateMeldung(grund, sperrSekunden)`, den die
    // Seite berechnet (`page.tsx:99`). Die vier Saetze stehen in Spec §3.3.4 (:2382-2385).
    await mount(<GateFormular fehlerText={SATZ_URL} returnTo="" />);
    expect(query(MELDUNG).textContent).toBe(SATZ_URL);
  });

  it("zeigt NICHTS, wenn es keinen Satz gibt", async () => {
    // ⛔ KEIN RUECKFALLTEXT (Spec:2396-2398): ein unbekannter `grund` ergibt `null`, und
    // dann steht am Formular nichts — schweigen ist besser als ein Satz, der nicht passt.
    await mount(<GateFormular fehlerText={null} returnTo="" />);
    expect(exists(MELDUNG)).toBe(false);
  });

  it("hat GENAU EINEN Meldungsort, und der frischere Rueckgabewert der Action gewinnt", async () => {
    /*
     * ⚠️ BEIDE QUELLEN SIND HIER GLEICHZEITIG GESETZT — anders traegt der Fall seine
     * Zusage nicht: mit nur einer Quelle bliebe er auch dann gruen, wenn die Insel zwei
     * Meldungsorte haette (der zweite waere schlicht leer) oder wenn sie den Satz aus der
     * URL ueber die Antwort der Action stellte. Genau das ist die Mutation, die der Review
     * als still gruen gemessen hat: `zustand.fehler ?? fehlerText` zu `fehlerText`.
     * Der Grund steht im Bestand (`lagerbuch/_ui/Gate.tsx:22-25`): „Zwei Fehlerorte waeren
     * zwei Zustaende, die einander widersprechen koennen."
     */
    aktion.mockResolvedValue({ fehler: SATZ_ACTION });
    await mount(<GateFormular fehlerText={SATZ_URL} returnTo="" />);
    await submitForm();
    const orte = queryAll(MELDUNG);
    expect(orte.length).toBe(1);
    expect(orte[0].textContent).toBe(SATZ_ACTION);
  });

  it("meldet ihn als role=alert und OHNE aria-live", async () => {
    /*
     * ⛔ DIE ENTSCHEIDUNG AUS DER FIX-RUNDE 1 (REVIEW-A11, Fund W3), hier zementiert.
     * Der Meldungsort kommt ZUSAMMEN MIT SEINEM INHALT in den Baum, und er entsteht auch
     * NACHTRAEGLICH — nach einem Antippen, ohne Seitenwechsel. Der Bestand hat genau das
     * gemessen entschieden (`lagerbuch/_ui/Gate.tsx:187-188`,
     * `lagerbuch/_ui/Gate.test.tsx:129-135`). Ein zusaetzliches `aria-live="polite"`
     * gewaenne bei den meisten Hilfsmitteln und kehrte die Wahl still um — deshalb steht
     * die Abwesenheit hier genauso als Zusage da wie die Rolle selbst.
     */
    await mount(<GateFormular fehlerText={SATZ_URL} returnTo="" />);
    expect(query(MELDUNG).getAttribute("role")).toBe("alert");
    expect(query(MELDUNG).getAttribute("aria-live")).toBeNull();
  });
});

describe("GateFormular — der Ausnahmeweg des oertlichen Umschlags", () => {
  it("faengt den VERBINDUNGSABBRUCH ab und zeigt den Ausnahme-Satz am EINEN Meldungsort", async () => {
    /*
     * Ohne das `try`/`catch` in `amGate` (`GateFormular.tsx:67-74`) lehnt der Aufruf ab
     * und React verwirft in die naechste Error Boundary — die Person saehe eine
     * technische Fehlerseite statt eines Satzes an ihrem Formular.
     */
    aktion.mockRejectedValue(new TypeError("Failed to fetch"));
    await mount(<GateFormular fehlerText={null} returnTo="" />);
    await submitForm();
    const orte = queryAll(MELDUNG);
    expect(orte.length).toBe(1);
    expect(orte[0].textContent).toBe(AUSNAHME_SATZ);
    /*
     * Der Satz ENTSTEHT NIE SERVERSEITIG — `_lib/gateTexte.ts` fuehrt die vier Saetze aus
     * Spec §3.3.4, und dieser ist keiner davon. Der Beleg steht in derselben Messung: der
     * einzige Ausgang der Action war eine ABLEHNUNG, der Satz kann also nur aus der Insel
     * stammen.
     */
    expect(aktion.mock.settledResults.map((r) => r.type)).toEqual(["rejected"]);
  });

  it("beantwortet auch eine ECHTE SERVERAUSNAHME nicht mit einer Netzdiagnose", async () => {
    /*
     * ⛔ URSACHENNEUTRAL, und das ist die Zusage. Der Kopf der Insel behauptet DREI Lagen
     * (`GateFormular.tsx:43-49`): Verbindungsabbruch, der Wurf von `requireRadioHost`
     * (`_actions/gate.ts:62`) und jede echte Serverausnahme — etwa ein fehlendes
     * `RADIO_AUSLEIH_SITZUNG_SECRET`, das `createAusleihSitzung` in JEDEM Trefferpfad
     * wirft (⬜ A-L7). Ein serverseitig geworfener Fehler erreicht den Client als `Error`
     * MIT `digest`, nicht als abgerissene Verbindung. Ein `catch`, das auf `digest`
     * verzweigte, liesse den Fall darueber gruen und diesen hier rot — deshalb sind es
     * zwei Faelle und keine Kopie.
     */
    aktion.mockRejectedValue(Object.assign(new Error("boom"), { digest: "3141592653" }));
    await mount(<GateFormular fehlerText={null} returnTo="" />);
    await submitForm();
    const orte = queryAll(MELDUNG);
    expect(orte.length).toBe(1);
    expect(orte[0].textContent).toBe(AUSNAHME_SATZ);
    expect(orte[0].textContent).not.toMatch(/Verbindung/);
  });

  it("verschluckt KEINE echte Antwort der Action", async () => {
    // Ein `catch`, das jeden Ausgang auf den Ausnahme-Satz zoege, waere die teuerste
    // Reparatur: die Abweisung („Code unbekannt") verschwaende hinter einer falschen
    // Diagnose, und die Person suchte den Fehler bei ihrem Empfang statt am Code.
    aktion.mockResolvedValue({ fehler: SATZ_URL });
    await mount(<GateFormular fehlerText={null} returnTo="" />);
    await submitForm();
    expect(query(MELDUNG).textContent).toBe(SATZ_URL);
  });

  it("ueberlebt den ERFOLGSFALL, in dem die Action mit undefined aufloest", async () => {
    /*
     * ⚠️ DER PFAD, DER IN PRODUKTION ZAEHLT, und die zweite Haelfte der Begruendung fuer
     * `amGate` (Abweichung 4 des A11-Berichts). `einloesenAmGate` endet im Erfolg mit
     * `redirect(...)` (`_actions/gate.ts:154`); der Client-Aufruf lehnt dafuer NICHT ab,
     * sondern loest mit `undefined` auf. Gemessen unter react-dom 19.2: React rendert
     * danach noch einmal, und ein ungeschuetztes `zustand.fehler` wirft dabei „Cannot read
     * properties of undefined" und reisst den Baum ab (`lagerbuch/_ui/Gate.tsx:103-110`).
     * `?? {}` ist damit der ERFOLGSPFAD, keine defensive Zier.
     */
    aktion.mockResolvedValue(undefined as unknown as GateZustand);
    await mount(<GateFormular fehlerText={null} returnTo="" />);
    await submitForm();
    expect(exists(MELDUNG)).toBe(false);
    // Der Baum steht noch: das Codefeld ist da, nicht abgeraeumt.
    expect(exists("input[name='code']")).toBe(true);
  });
});

describe("GateFormular — was beim Absenden wirklich ankommt", () => {
  it("reicht returnTo als verstecktes Feld durch", async () => {
    await mount(<GateFormular fehlerText={null} returnTo="/t/regal-9" />);
    const feld = query<HTMLInputElement>("input[name='returnTo']");
    expect(feld.value).toBe("/t/regal-9");
    expect(feld.getAttribute("type")).toBe("hidden");
  });

  it("schickt Code UND returnTo an die Action — nicht nur ins Markup", async () => {
    /*
     * Die Zusage ist nicht „das Feld steht da", sondern „der Wert erreicht
     * `einloesenAmGate`". Ein Feld ausserhalb des `<form>` saehe im Markup identisch aus
     * und kaeme nie an; ein umbenanntes `name` ebenso. Genau diese Mutation hat der Review
     * als still gruen gemessen — und mit ihr faellt zugleich das Etiketten-Plumbing aus
     * A10 (`t/[code]/route.ts:76-84` schreibt `returnTo` auf die Gate-URL,
     * `_actions/gate.ts:64` liest ihn aus `formData`).
     *
     * ⚠️ DER CODE STEHT HIER IN DER SCHREIBWEISE DES AUFSTELLERS, mit Trennern und
     * Kleinbuchstaben: die Insel setzt bewusst KEIN `pattern` und KEIN `maxLength`
     * (`GateFormular.tsx:108-113`), weil `normalisiereCode` serverseitig aufraeumt. Ein
     * Browser-`pattern` wiese genau diese Schreibweise ab.
     */
    aktion.mockResolvedValue({});
    await mount(<GateFormular fehlerText={null} returnTo="/t/regal-9" />);
    await fill("input[name='code']", "kj3m-7q0z-h8ax-bt2v-9r5n-w4dc-ye6f");
    await submitForm();
    expect(aktion).toHaveBeenCalledTimes(1);
    const daten = aktion.mock.calls[0][1];
    expect(daten.get("code")).toBe("kj3m-7q0z-h8ax-bt2v-9r5n-w4dc-ye6f");
    expect(daten.get("returnTo")).toBe("/t/regal-9");
  });
});
