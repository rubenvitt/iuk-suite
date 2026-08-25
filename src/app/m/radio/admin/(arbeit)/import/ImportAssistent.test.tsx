// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/import/ImportAssistent.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * INSEL 4 — DER ZWEIPHASIGE CSV-IMPORT (`Spec:4506`, §5.7; Aufgabe V18).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile stirbt
 * jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⚠️ DER BLINDE FLECK, GEERBT UND BENANNT: **Falle 1 und Falle 9**. In jsdom gibt es keine
 * RSC-Grenze — `Upload.Dragger`, `Typography.Text` und die zwei `render`-Funktionen der
 * Vorschautabelle sind hier gewoehnliche Bauteile. Zoege jemand die Flaeche in die Server
 * Component, bliebe JEDER Fall dieser Datei gruen und der Abruf antwortete mit HTTP 500. Der
 * Waechter dagegen ist der Playwright-Fall (`Spec:4881-4882`, Fall 7 in
 * `e2e/radio-verwaltung.spec.ts`) — gefahren in Aufgabe V23.
 */

/*
 * ⛔ `vi.hoisted`, WEIL `vi.mock` AN DEN DATEIANFANG GEHOBEN WIRD. Ein gewoehnliches
 * `const schreibenMock = vi.fn()` darueber ist zur Ausfuehrungszeit der Fabrik noch nicht
 * initialisiert (gemessen in V13: `ReferenceError: Cannot access ... before initialization`,
 * und die ganze Datei faellt aus, nicht ein Fall).
 *
 * ⛔ DIE ACTION WIRD DIREKT IMPORTIERT UND NICHT ALS PROP GEREICHT
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`) — deshalb ist der Modulersatz der
 * einzige Weg, sie im Test abzugreifen. ⛔ UND ER IST ZUGLEICH DER MESSPUNKT FUER DIE
 * ZWEIPHASIGKEIT: `schreibenMock.mock.calls[n][2]` traegt den `probelauf`-Wert.
 */
const { schreibenMock } = vi.hoisted(() => ({ schreibenMock: vi.fn() }));
vi.mock("../../actions", () => ({ importSchreibenAction: schreibenMock }));

const INSEL_ORDNER = "src/app/m/radio/admin/(arbeit)/import";
const QUELLE_INSEL = `${INSEL_ORDNER}/ImportAssistent.tsx`;
const QUELLE_SEITE = `${INSEL_ORDNER}/page.tsx`;

/**
 * DIE DATEIEN DER INSEL — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**,
 * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „Rulings"). Gemessen in der
 * Schlusspruefung zu V13 (Fund M2): eine zusaetzliche Datei in einem Inselverzeichnis, ohne
 * Bauform-Direktive UND mit einem Wertimport aus `_db/schema`, liess eine handgeschriebene
 * Namensliste voellig unbeeindruckt.
 *
 * ⛔ DER AUSSCHLUSS STEHT AM BLATT UND NICHT AM AST (Ruling **R-V11-3**). ⚠️ `hochladen/` ist
 * ein UNTERVERZEICHNIS und faellt aus `readdirSync` heraus — das ist richtig: der Handler ist
 * Serverseite und traegt seine eigene Testdatei (`hochladen/route.test.ts`).
 */
const SERVER_EINSTIEGE = ["page.tsx", "layout.tsx", "template.tsx", "route.ts"];

function inselDateien(): string[] {
  return readdirSync(INSEL_ORDNER)
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !/\.(?:test|spec)\.tsx?$/.test(name))
    .filter((name) => !SERVER_EINSTIEGE.includes(name))
    .sort();
}

/** ⛔ Die Sollwerttafel steht NUR auf der rechten Seite — sie ist der Prueffling der Messung. */
const INSEL_SOLL = ["ImportAssistent.tsx"];

import { act } from "react";
import { click, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { ohneKommentare } from "../../../_lib/quelltextScan";
import { IMPORTIERBARE_FELDER } from "../../../_lib/csv/kopfzeilen";
import { IMPORTKLASSEN } from "../../../_lib/csv/klassifizieren";
import type { KlassifizierteZeile, Zusammenfassung } from "../../../_lib/csv/klassifizieren";
import { ImportAssistent, ablegeWeiche } from "./ImportAssistent";

/** Der aeussere Pfad des Hochladen-Handlers — er steht in `_lib/routen.ts`. */
const HOCHLADEN = "/admin/import/hochladen";

/** Eine Datei mit erkennbarer ISSI-Kopfzeile: `automatischeSpaltenzuordnung` trifft sie. */
const MIT_ISSI = { spalten: ["ISSI", "Rufname"], zeilen: [["1000001", "41/12"]] };
/**
 * Eine Datei OHNE erkennbare ISSI-Kopfzeile. ⚠️ „Kennung" waere falsch — `SYNONYME`
 * (`_lib/csv/kopfzeilen.ts:105`) fuehrt es als ISSI-Alias; „Spalte A" trifft keinen Eintrag.
 */
const OHNE_ISSI = { spalten: ["Spalte A", "Spalte B"], zeilen: [["1000001", "41/12"]] };

function leereBilanz(): Zusammenfassung {
  return { created: 0, updated: 0, unchanged: 0, error: 0, "skipped-no-permission": 0 };
}

function zeile(teil: Partial<KlassifizierteZeile> = {}): KlassifizierteZeile {
  return { zeilenNummer: 0, issi: "1000001", klasse: "created", aenderungen: [], ...teil };
}

let hochladeAntwort: unknown = { ok: true, ...MIT_ISSI };
let hochladeStatus = 200;
const fetchAufrufe: { url: string; methode: string }[] = [];

/**
 * ⛔ DER XHR-SPION IST DIE TRAGENDE HAELFTE DES FALLES „die Datei wird nicht automatisch
 * hochgeladen". `beforeUpload → return false` (`ImportWizard.tsx:156`) verhindert, dass
 * rc-upload SELBST hochlaedt — und rc-upload benutzt dafuer `XMLHttpRequest`, nicht `fetch`
 * (`rc-upload/es/request.js`). Ein Fall, der nur die `fetch`-Aufrufe zaehlt, saehe den
 * zweiten, stillen POST also GAR NICHT.
 */
const xhrAufrufe: string[] = [];
class XhrSpion {
  upload = {};
  open(methode: string, adresse: string) {
    xhrAufrufe.push(`${methode} ${adresse}`);
  }
  setRequestHeader() {}
  send() {}
  abort() {}
  addEventListener() {}
  removeEventListener() {}
  getAllResponseHeaders() {
    return "";
  }
}

beforeEach(() => {
  schreibenMock.mockReset();
  schreibenMock.mockResolvedValue({ ok: true, zusammenfassung: leereBilanz(), zeilen: [] });
  hochladeAntwort = { ok: true, ...MIT_ISSI };
  hochladeStatus = 200;
  fetchAufrufe.length = 0;
  xhrAufrufe.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (adresse: unknown, optionen?: { method?: string }) => {
      fetchAufrufe.push({ url: String(adresse), methode: optionen?.method ?? "GET" });
      return new Response(JSON.stringify(hochladeAntwort), {
        status: hochladeStatus,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  vi.stubGlobal("XMLHttpRequest", XhrSpion);
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

/** Der Schritt, auf dem der Assistent gerade steht — er steht am Wurzelelement. */
function schritt(): string {
  return query('[data-rolle="radio-import"]').getAttribute("data-schritt") ?? "";
}

function text(rolle: string): string {
  return (query(`[data-rolle="${rolle}"]`).textContent ?? "").trim();
}

/**
 * Die Klassen des `Alert`, in dem der Zuordnungshinweis steckt.
 *
 * ⛔ UEBER `closest(".ant-alert")` UND NICHT UEBER DEN GRIFF SELBST: der Griff sitzt am
 * inneren `<span>` der `message` — dieselbe Form wie `UpdateSuche.tsx:229-233` —, damit
 * `text("radio-import-hinweis")` und der Playwright-Fall (`e2e/radio-verwaltung.spec.ts:637`)
 * den blanken Satz lesen und nicht das Zeichen daneben. Der TON haengt am aeusseren Kasten.
 */
function hinweisKasten(): string {
  const kasten = query('[data-rolle="radio-import-hinweis"]').closest(".ant-alert");
  if (!(kasten instanceof HTMLElement)) throw new Error("der Hinweis steckt in keinem antd-Alert");
  return kasten.className;
}

/**
 * Eine Datei im Ablegefeld ablegen.
 *
 * ⛔ UEBER DAS `<input type="file">`, DAS rc-upload RENDERT — das ist der Weg, den eine
 * bedienende Person nimmt, und der einzige, der `beforeUpload` wirklich durchlaeuft.
 * ⚠️ `files` wird ueber `defineProperty` gesetzt: jsdom laesst die Eigenschaft nicht
 * zuweisen, und `DataTransfer` ist dort nicht vollstaendig umgesetzt. rc-upload liest sie mit
 * `Array.prototype.slice.call(...)`, ein Feld genuegt also.
 */
async function legeDateiAb(name = "geraete.csv"): Promise<void> {
  const eingabe = query<HTMLInputElement>('input[type="file"]');
  const datei = new File(["ISSI;Rufname\n1000001;41/12\n"], name, { type: "text/csv" });
  Object.defineProperty(eingabe, "files", { value: [datei], configurable: true });
  await act(async () => {
    eingabe.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/**
 * Ein Auswahlfeld der Zuordnung bedienen.
 *
 * ⛔ `mousedown` AUF DER HUELLE, NICHT `click` AUF DEM FELD — gemessen im Haus
 * (`src/app/m/aufgaben/_ui/testFelder.ts:56-59`, uebernommen in
 * `admin/(arbeit)/ausleihen/AusleihenTabelle.test.tsx:178-215`): rc-select oeffnet am
 * `onMouseDown` seines Wrapper-`<div>`.
 *
 * ⛔ DIE OPTIONSSUCHE IST AUF DAS OFFENE PORTAL EINGESCHRAENKT, und das ist hier PFLICHT und
 * nicht Vorsicht: auf dieser Flaeche stehen NEUNZEHN Auswahlfelder. Eine globale Suche ueber
 * `document.body` — die Form, die `AusleihenTabelle.test.tsx:204-206` bei EINEM Feld
 * verantworten kann — traefe still das falsche Portal. rc-select markiert geschlossene
 * Aufklapper mit `.ant-select-dropdown-hidden`.
 */
async function waehleSpalte(feld: string, anzeigetext: string): Promise<void> {
  const huelle = query(`[data-rolle="radio-import-wahl-${feld}"]`).closest(".ant-select");
  if (!(huelle instanceof HTMLElement)) throw new Error(`${feld} steckt in keinem antd-Select`);
  await act(async () => {
    huelle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    huelle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  const optionen = Array.from(
    document.body.querySelectorAll<HTMLElement>(
      ".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option",
    ),
  );
  const treffer = optionen.find((o) => (o.textContent ?? "").trim() === anzeigetext);
  if (!treffer) {
    throw new Error(`Option nicht gefunden — da stand: ${optionen.map((o) => o.textContent).join(", ")}`);
  }
  await act(async () => {
    treffer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/**
 * Einen Knoten ueberfahren und antds Aufklappverzoegerung abwarten.
 *
 * ⛔ `mouseover` UND `mouseenter`: React leitet `onMouseEnter` aus `mouseover` ab (das
 * Enter/Leave-Plugin), ein reines `mouseenter` erreicht die Komponente nicht.
 * ⚠️ `mouseEnterDelay` steht bei antd auf 0,1 s — die Wartezeit ist echt und nicht
 * verhandelbar; mit Attrappenzeitgebern liefe rc-triggers `raf` daneben.
 */
async function ueberfahre(knoten: HTMLElement): Promise<void> {
  await act(async () => {
    knoten.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    knoten.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((weiter) => setTimeout(weiter, 300));
  });
}

/** Bis zur Vorschau durchfahren: Datei ablegen, „Weiter", Ergebnis der Action ist gesetzt. */
async function bisZurVorschau(bilanz: {
  zusammenfassung: Zusammenfassung;
  zeilen: KlassifizierteZeile[];
}): Promise<void> {
  schreibenMock.mockResolvedValue({ ok: true, ...bilanz });
  await mount(<ImportAssistent />);
  await legeDateiAb();
  await click('[data-rolle="radio-import-weiter"]');
}

describe("radio-Import: die vier Schritte", () => {
  it("die vier Schritte laufen in dieser Reihenfolge", async () => {
    /*
     * ⛔ DER FALL, DEN `Spec:4862` NAMENTLICH NENNT. Vier Schritte, 1:1
     * `ImportWizard.tsx:33-35`: `upload | mapping | preview | done`.
     *
     * ⛔ UND DIE ZWEITE HAELFTE IST DIE ZWEIPHASIGKEIT SELBST: `commit` wird ZWEIMAL gerufen,
     * einmal mit `probelauf === true` (`ImportWizard.tsx:107`) und einmal mit `false`
     * (`:123`). Eine einphasige Fassung („Datei hoch, fertig") ist „kein Port, sondern ein
     * anderes Produkt" (`Spec:4695-4702`) — und sie waere ohne diese Zeile unsichtbar: die
     * Flaeche saehe gleich aus, nur die Vorschau schriebe schon.
     */
    await mount(<ImportAssistent />);
    expect(schritt()).toBe("upload");

    await legeDateiAb();
    expect(schritt(), "der Dateischritt fuehrt nicht in die Zuordnung").toBe("mapping");

    await click('[data-rolle="radio-import-weiter"]');
    expect(schritt(), "die Zuordnung fuehrt nicht in die Vorschau").toBe("preview");

    await click('[data-rolle="radio-import-ausfuehren"]');
    expect(schritt(), "die Vorschau fuehrt nicht in den Abschluss").toBe("done");
    /* ⛔ UND DER ABSCHLUSSKNOPF ZEIGT AUF DIE AEUSSERE GERAETELISTE — eine benannte
       Abweichung von `ImportWizard.tsx:237` (`navigate('/devices')`), weil die Suite aeussere
       Pfade fuehrt (`_lib/nav.ts:9-11`). Bis zur Schlusspruefung war dieses Ziel von keinem
       Fall und keinem Playwright-Schritt geprueft (`REVIEW-V18.md`, Fund F6). */
    expect(
      query('[data-rolle="radio-import-zu-geraeten"]').getAttribute("href"),
      "der Abschluss fuehrt nicht auf die aeussere Geraeteliste",
    ).toBe("/admin/geraete");

    expect(schreibenMock.mock.calls.length, "commit wird nicht zweimal gerufen").toBe(2);
    expect(schreibenMock.mock.calls[0]![2], "der erste Lauf ist KEIN Probelauf").toBe(true);
    expect(schreibenMock.mock.calls[1]![2], "der zweite Lauf ist ein Probelauf").toBe(false);
    // ⛔ BEIDE LAEUFE BEKOMMEN DIESELBE ZUORDNUNG UND DIESELBEN ZEILEN (`:107`, `:123`).
    expect(schreibenMock.mock.calls[0]![0]).toEqual({ issi: 0, rufname: 1 });
    expect(schreibenMock.mock.calls[1]![0]).toEqual({ issi: 0, rufname: 1 });
  });

  it("ISSI-Spalte muss zugeordnet sein blockiert den Uebergang", async () => {
    /*
     * `Spec:4862`; woertlich `ImportWizard.tsx:211` (`disabled={!issiMapped}`) und `:174-177`
     * (der Hinweis oben wechselt).
     *
     * ⚠️ WAS DIESER FALL NICHT MISST, statt es zu behaupten: den ZWEITEN Riegel in
     * `starteVorschau` (`ImportWizard.tsx:108-111`, Text `:109`). Er ist ueber die Flaeche
     * NICHT erreichbar, weil der Knopf davor gesperrt ist — im Bestand genauso. Die
     * serverseitige Fassung derselben Regel ist gemessen
     * (`admin/actions.verhalten.test.ts`, „lehnt ohne zugeordnete ISSI-Spalte mit dem
     * woertlichen Satz ab"), und ihr Text erreicht diese Flaeche ueber den Fall
     * „ein Fehlschlag der Action zeigt IHREN Text" weiter unten.
     */
    hochladeAntwort = { ok: true, ...OHNE_ISSI };
    await mount(<ImportAssistent />);
    await legeDateiAb();

    expect(schritt()).toBe("mapping");
    expect(text("radio-import-hinweis")).toBe(
      "Die ISSI-Spalte muss zugeordnet werden, um fortzufahren.",
    );
    /*
     * ⛔ UND DER TON WECHSELT MIT — 1:1 `ImportWizard.tsx:170-178`
     * (`<Alert type={issiMapped ? 'success' : 'warning'} showIcon>`). Ohne diese zwei Zeilen
     * traegt der Fall auch ein nacktes `<p>` oder einen fest verdrahteten Ton: der Satz
     * stuende richtig da, und der Kasten sagte immer dasselbe. Der Fund F3 der
     * Schlusspruefung (`REVIEW-V18.md`) ist genau diese Luecke.
     */
    expect(hinweisKasten(), "der offene Zustand traegt nicht den Warnton").toContain(
      "ant-alert-warning",
    );
    const weiter = query<HTMLButtonElement>('[data-rolle="radio-import-weiter"]');
    expect(weiter.disabled, "der Uebergang ist ohne ISSI-Spalte offen").toBe(true);

    await click('[data-rolle="radio-import-weiter"]');
    expect(schritt(), "der gesperrte Knopf hat den Uebergang doch ausgeloest").toBe("mapping");
    expect(schreibenMock, "ohne ISSI-Spalte lief ein Probelauf").not.toHaveBeenCalled();

    // Von Hand zugeordnet — derselbe Weg, den eine bedienende Person nimmt (`:188-203`).
    await waehleSpalte("issi", "Spalte A");
    expect(text("radio-import-hinweis")).toBe("ISSI ist zugeordnet.");
    expect(hinweisKasten(), "der zugeordnete Zustand traegt nicht den Erfolgston").toContain(
      "ant-alert-success",
    );
    expect(
      query<HTMLButtonElement>('[data-rolle="radio-import-weiter"]').disabled,
      "der Uebergang bleibt gesperrt, obwohl die ISSI-Spalte zugeordnet ist",
    ).toBe(false);
  });

  it("ein Zurueck aus der Vorschau fuehrt in die Zuordnung, nicht in den Dateischritt", async () => {
    /*
     * ⛔ 1:1 `ImportWizard.tsx:226` (`onBack={() => setStep('mapping')}`). Der Unterschied
     * ist keine Feinheit: ein Sprung in den Dateischritt verwuerfe die ganze Zuordnung —
     * neunzehn Auswahlfelder —, weil `handleFile` sie beim naechsten Ablegen neu setzt
     * (`:98`).
     */
    await bisZurVorschau({ zusammenfassung: leereBilanz(), zeilen: [] });
    expect(schritt()).toBe("preview");

    await click('[data-rolle="radio-import-zurueck"]');
    expect(schritt(), "das Zurueck aus der Vorschau verwirft die Zuordnung").toBe("mapping");
    // Die Zuordnung steht noch — das ist der GRUND fuer die Zeile darueber.
    expect(text("radio-import-hinweis")).toBe("ISSI ist zugeordnet.");
  });

  it("ein Zurueck aus der Zuordnung fuehrt in den Dateischritt", async () => {
    /*
     * ⛔ 1:1 `ImportWizard.tsx:208` (`<Button onClick={() => setStep('upload')}>Zurück</Button>`).
     * ⛔ ZWEI ZURUECK-TASTEN, ZWEI VERSCHIEDENE ZIELE — und der Unterschied ist der ganze
     * Punkt: aus der VORSCHAU geht es in die Zuordnung (`:226`), aus der ZUORDNUNG in den
     * Dateischritt (`:208`). Wer beide auf dasselbe Ziel einebnet, baut aus der einen eine
     * TOTE TASTE: wer die falsche Datei abgelegt hat, kaeme nur ueber einen Neuladen der
     * Seite zurueck.
     *
     * ⚠️ BEIDE TASTEN TRAGEN DENSELBEN GRIFF `radio-import-zurueck` — sie stehen nie
     * gleichzeitig im Dokument (die zwei `Card` haengen an `schritt === "mapping"` bzw.
     * `=== "preview"`). Die Zeile davor prueft deshalb den Schritt, sonst maesse dieser Fall
     * unbemerkt wieder die Vorschau-Taste.
     */
    await mount(<ImportAssistent />);
    await legeDateiAb();
    expect(schritt(), "der Fall steht nicht auf der Zuordnung — er misst die falsche Taste").toBe(
      "mapping",
    );

    await click('[data-rolle="radio-import-zurueck"]');
    expect(schritt(), "das Zurueck der Zuordnung fuehrt nicht in den Dateischritt").toBe("upload");
  });

  it("die Datei wird nicht automatisch hochgeladen", async () => {
    /*
     * ⛔ DER FALL GEGEN EINEN STILLEN DOPPEL-POST — 1:1 `ImportWizard.tsx:154-157`, dessen
     * Kommentar den Grund woertlich nennt: „prevent antd auto-POST; we upload via
     * useImportParse". Gaebe `beforeUpload` `true` zurueck, liefe im Browser je Datei ein
     * ZWEITER Hochladeversuch — rc-uploads eigener, ueber `XMLHttpRequest` und auf antds
     * Vorgabeadresse (`@rc-component/upload/es/request.js:22`). Er faellt in keinem Tor auf:
     * die Flaeche verhaelt sich gleich.
     *
     * ⛔ DIE ZUSICHERUNG STEHT AUF ZWEI HAELFTEN, UND DAS IST EINE MESSUNG UND KEINE
     * BEQUEMLICHKEIT. Die erste Fassung dieses Falles hing allein am XHR-Spion darunter;
     * Sonde S-V18b (`return true` statt `return false`) ergab damit ⛔ **0 rot** — auch mit
     * einem echten Zeitschritt von 50 ms und mit Aufzeichnung im KONSTRUKTOR:
     * `new XMLHttpRequest()` wurde nie erreicht. rc-uploads eigener Postweg laeuft in jsdom
     * gemessen NICHT an (`AjaxUploader.js:142-165` -> `:235`), und ein Fall, der auf einem
     * Zweig steht, den die Umgebung gar nicht betritt, bewacht nichts.
     *
     * ⛔ DIE ZWEITE FASSUNG WAR EIN QUELLTEXT-SCAN AUF DIE ZEICHENFOLGE `return false;`, UND
     * SIE TRUG EBENSO WENIG. Gemessen in der Schlusspruefung zu V18 (REVIEW-V18, Fund F2,
     * Sonde M1): ein `beforeUpload`, das
     * `{ void handhabeDatei(...); if (datei.size < 0) return false; return true; }` schrieb —
     * semantisch IMMER `true`, also genau der Defekt —, lief `Tests 14 passed (14)` durch,
     * bei typecheck 0. Das alte Muster belegte nur, dass die Zeichenfolge irgendwo vor der
     * ersten `}` steht, ⛔ NICHT, dass der RUECKGABEWERT `false` ist.
     *
     * ⛔ DESHALB JETZT DER RUECKGABEWERT SELBST: die Weiche ist als benannte Funktion
     * `ablegeWeiche` aus der Insel exportiert, dieser Fall RUFT sie und liest ihr Ergebnis.
     * ⚠️ WARUM NICHT DER KOERPERSCHNITT, den die Pruefung als Weg (a) nannte — und der
     * tragende Grund ist NICHT der naheliegende. ⛔ `funktionsKoerper` GIBT ES SEHR WOHL:
     * `riegel.test.ts:206-220`, zweite Ausfertigung `_lib/bauform.test.ts:391` (deren
     * Kopfkommentar `:57` die Herkunft selbst nennt). Nur `_lib/quelltextScan.ts` fuehrt ihn
     * nicht — der exportiert `ohneKommentare` (`:61`) und `bereinigt` (`:208`).
     * ⛔ DER SCHNITT HAETTE DIE ALTE FORM STRUKTURELL NICHT FASSEN KOENNEN, und DAS traegt:
     * er sucht `\bfunction\s+<name>\s*\(` (`riegel.test.ts:208`) und findet damit nur
     * FUNKTIONSDEKLARATIONEN. Die alte Weiche war ein anonymer Pfeil in einem JSX-Attribut —
     * Weg (a) war auf sie gar nicht anwendbar; erst Weg (b) macht sie schneidbar, und dann
     * braucht es den Schnitt nicht mehr.
     * ⚠️ UND DIE ZWEITE HAELFTE DER FRUEHEREN BEGRUENDUNG TRUG NUR SINNGEMAESS: die Warnung
     * „Wer eine vierte Kopie dieser Bauart anlegt, baut den Fehler neu" (`KONTEXT.md:244-247`)
     * zielt ausweislich ihres Wortlauts auf die BEREINIGUNGS-Bauart
     * (`ohneKommentareUndZeichenketten`, `ohneRegexLiterale`, `bereinigt`), nicht auf
     * `funktionsKoerper`.
     *
     * ⛔ UND DIE VERDRAHTUNG WIRD MITGEPRUEFT: ein gemessener Rueckgabewert nuetzt nichts,
     * wenn antd die Funktion gar nicht bekommt. Der Scan darunter nagelt `beforeUpload` auf
     * genau diesen Aufruf fest — und faengt damit die Mutationsform M1 (ein Pfeil im JSX mit
     * totem `return false;` davor).
     *
     * ⚠️ DIE ZWEI VERHALTENSZEILEN BLEIBEN TROTZDEM STEHEN, mit ihrer benannten Reichweite:
     * `fetchAufrufe` haelt fest, dass der EINE bewusste POST an den Handler geht (und nur
     * einer), `xhrAufrufe` faengt einen `customRequest` oder einen von Hand gebauten
     * XHR-Weg, den keiner der beiden anderen Teile saehe. Keine ersetzt die andere.
     */
    await mount(<ImportAssistent />);
    await legeDateiAb();
    /*
     * Ein echter Zeitschritt: rc-uploads Weg laege mehrere Mikroaufgaben HINTER dem `act` des
     * Ablegens (`AjaxUploader.js:142-165`). Er kostet 50 ms und nimmt dem `xhrAufrufe`-Teil
     * die naheliegendste Ausrede.
     */
    await act(async () => {
      await new Promise((weiter) => setTimeout(weiter, 50));
    });

    /* ⛔ HAELFTE 1 — DER GEMESSENE RUECKGABEWERT. */
    const gesehen: File[] = [];
    const probe = new File(["ISSI;Rufname\n"], "probe.csv", { type: "text/csv" });
    expect(
      ablegeWeiche((datei) => gesehen.push(datei))(probe),
      "die Ablege-Weiche gibt nicht false zurueck — antd laedt die Datei ein zweites Mal hoch",
    ).toBe(false);
    /* Sie reicht die Datei trotzdem weiter — ohne diese Zeile waere ein `return false;` allein gruen. */
    expect(gesehen, "die Weiche reicht die abgelegte Datei nicht weiter").toEqual([probe]);

    /* ⛔ HAELFTE 2 — DIE VERDRAHTUNG. */
    const insel = ohneKommentare(readFileSync(QUELLE_INSEL, "utf8"));
    expect(
      insel,
      "beforeUpload haengt nicht an der gemessenen Weiche — ein Pfeil im JSX ist ungeprueft",
    ).toMatch(/beforeUpload=\{\s*ablegeWeiche\(/);

    expect(xhrAufrufe, "ein zweiter Hochladeweg ueber XMLHttpRequest").toEqual([]);
    expect(fetchAufrufe, "der Dateischritt geht nicht als EIN POST an den Handler").toEqual([
      { url: HOCHLADEN, methode: "POST" },
    ]);
  });

  it("ein unlesbarer Dateischritt meldet den Text des Bestands und bleibt im Dateischritt", async () => {
    /*
     * ⛔ 1:1 `ImportWizard.tsx:101` (`onError: () => message.error('Datei konnte nicht
     * gelesen werden')`). ⚠️ DER SERVER ANTWORTET MIT EINEM ANDEREN TEXT — „Leere oder
     * ungültige Datei" (`import.ts:28`, in der Suite `LESE_FEHLER`) —, und der Bestand
     * verwirft ihn hier ebenso: `onError` kennt den Rumpf nicht. Beide Texte sind gemessen,
     * keiner ist erfunden.
     */
    hochladeAntwort = { ok: false, fehler: "Leere oder ungültige Datei" };
    await mount(<ImportAssistent />);
    await legeDateiAb();

    expect(schritt(), "eine unlesbare Datei fuehrt in die Zuordnung").toBe("upload");
    expect(text("radio-import-fehler")).toBe("Datei konnte nicht gelesen werden");
  });

  it("ein Fehlschlag der Action zeigt IHREN Text, nicht einen erfundenen", async () => {
    /*
     * ⛔ ENTSCHEIDUNG E6 (`Spec:3754-3776`), dieselbe Linie wie `NotizFeld.tsx:35-38` und
     * `UpdateSuche.tsx`: kein Toast — „der Fehlertext kommt aus der Action". Ein hier
     * eingesetzter Ersatztext verdeckte genau die Meldung, die dem Bedienenden sagt, WAS
     * fehlt; „ISSI-Spalte muss zugeordnet sein" (`admin/actions.ts:141`, 1:1
     * `ImportWizard.tsx:109`) ist die, die es am haeufigsten ist.
     */
    schreibenMock.mockResolvedValue({ ok: false, fehler: "ISSI-Spalte muss zugeordnet sein" });
    await mount(<ImportAssistent />);
    await legeDateiAb();
    await click('[data-rolle="radio-import-weiter"]');

    expect(schritt(), "ein Fehlschlag hat die Vorschau geoeffnet").toBe("mapping");
    expect(text("radio-import-fehler")).toBe("ISSI-Spalte muss zugeordnet sein");
  });
});

describe("radio-Import: die Vorschau und der Abschluss", () => {
  it("fuenf Klassen erscheinen in der Zusammenfassung", async () => {
    /*
     * ⛔ `toBe(5)` — NICHT DREI. Die Entscheidung dazu ist in V9 gefallen und steht
     * ausgeschrieben in `_lib/csv/klassifizieren.ts:35-44`: die Spec nennt drei Klassen, der
     * BESTAND fuehrt fuenf (`ImportWizard.tsx:60-66`), und „uebernommen wird, was im Bestand
     * steht". ⛔ Faellt eine weg, faellt sie STILL: die Karten stehen dann eben zu viert da,
     * und niemand vermisst „Übersprungen: 0".
     *
     * ⛔ BEIDE ORTE, UND DAS IST KEINE DOPPELUNG: die fuenf Kennzahlkarten der Vorschau
     * (`:296-302`) und der Satz `Klasse: n · …` im Abschluss (`:247-251`) entstehen aus
     * verschiedenen Zeilen der Insel. Ein Fall ueber nur einem von beiden liesse den anderen
     * ungedeckt.
     */
    const zusammenfassung: Zusammenfassung = {
      created: 2,
      updated: 1,
      unchanged: 3,
      error: 1,
      "skipped-no-permission": 4,
    };
    await bisZurVorschau({ zusammenfassung, zeilen: [zeile()] });

    expect(queryAll('[data-rolle="radio-import-kennzahl"]').length).toBe(5);
    expect(IMPORTKLASSEN.length, "die Klassenliste selbst ist geschrumpft").toBe(5);

    await click('[data-rolle="radio-import-ausfuehren"]');
    expect(text("radio-import-bilanz")).toBe(
      "Neu: 2 · Aktualisiert: 1 · Unverändert: 3 · Fehler: 1 · Übersprungen: 4",
    );
    expect(text("radio-import-bilanz").split(" · ").length, "eine Klasse fehlt im Satz").toBe(5);
  });

  it("bei Uebersprungen steht die Erklaerung dabei", async () => {
    /*
     * ⛔ 1:1 `ImportWizard.tsx:274-276`: NUR bei `skipped-no-permission` haengt der `Tooltip`
     * mit „updater darf keine neuen Geräte anlegen" am Tag. Ohne ihn sieht eine
     * uebersprungene Zeile aus wie ein Fehler des Imports statt wie eine Rechtefrage — und
     * der Bedienende faehrt den Import ein zweites Mal.
     *
     * ⚠️ antds `Tooltip` rendert seinen Inhalt ERST BEIM UEBERFAHREN und in ein PORTAL an
     * `document.body`; deshalb der `mouseenter` und die Wartezeit (`mouseEnterDelay` 0.1 s).
     */
    await bisZurVorschau({
      zusammenfassung: leereBilanz(),
      zeilen: [
        zeile({ zeilenNummer: 0, klasse: "created" }),
        zeile({ zeilenNummer: 1, issi: "1000002", klasse: "skipped-no-permission" }),
      ],
    });

    const marken = queryAll('[data-rolle="radio-import-klasse"]');
    expect(marken.map((m) => (m.textContent ?? "").trim())).toEqual(["Neu", "Übersprungen"]);

    /*
     * ⛔ DIE GEGENPROBE ZUERST, und sie traegt die Haelfte „NUR bei diesem einen Zustand":
     * ohne sie waere der Fall auch dann gruen, wenn JEDE Klasse dieselbe Erklaerung truege —
     * und dann stuende an einer angelegten Zeile „updater darf keine neuen Geräte anlegen".
     */
    await ueberfahre(marken[0]!);
    expect(
      document.body.querySelector('[role="tooltip"]'),
      "auch die angelegte Zeile traegt eine Erklaerung",
    ).toBeNull();

    await ueberfahre(marken[1]!);
    const erklaerung = document.body.querySelector('[role="tooltip"]');
    expect(erklaerung?.textContent, "die Erklaerung fehlt am uebersprungenen Tag").toBe(
      "updater darf keine neuen Geräte anlegen",
    );
    /*
     * ⛔ UND SIE HAENGT AN DIESEM TAG, nicht irgendwo im Dokument: antd verknuepft beide ueber
     * `aria-describedby`. Ohne diese Zeile bestuende der Fall auch, wenn die Erklaerung an
     * einer ganz anderen Zeile haengt — im Portal sieht man das nicht.
     */
    expect(marken[1]!.getAttribute("aria-describedby")).toBe(erklaerung?.getAttribute("id"));
  });

  it("eine Fehlerzeile zeigt ihren Text statt der Feldliste", async () => {
    /*
     * ⛔ 1:1 `ImportWizard.tsx:284-289`: bei einem Fehler steht der Fehlertext STATT der
     * Feldliste (`:286`), sonst stehen die FELDNAMEN (`:288`) oder ein Gedankenstrich.
     * ⛔ BEIDES NEBENEINANDER WAERE DER FEHLER: eine Zeile, die abgelehnt wurde, saehe dann
     * aus, als haette sie trotzdem etwas geaendert.
     */
    await bisZurVorschau({
      zusammenfassung: leereBilanz(),
      zeilen: [
        zeile({ zeilenNummer: 0, aenderungen: [{ feld: "rufname", alt: null, neu: "41/12" }] }),
        zeile({ zeilenNummer: 1, issi: "", klasse: "error", fehler: "ISSI fehlt", aenderungen: [] }),
        zeile({ zeilenNummer: 2, issi: "1000003", klasse: "unchanged", aenderungen: [] }),
      ],
    });

    const zellen = queryAll('[data-rolle="radio-import-aenderungen"]').map((z) =>
      (z.textContent ?? "").trim(),
    );
    expect(zellen).toEqual(["rufname", "ISSI fehlt", "—"]);
    expect(zellen[1], "die Fehlerzeile listet zusaetzlich ihre Felder").not.toContain("rufname");
  });
});

describe("radio-Import: die Bauform der Insel und ihrer Seite", () => {
  it("die Datei der Insel traegt use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 1 UND FALLE 9 (Bauform-Zulaessigkeitstafel Nr. 1 und 3): `Upload.Dragger` und
     * `Typography.Text` sind Compound-Zugriffe, und die Vorschautabelle traegt zwei
     * `render`-Funktionen. Beides ist aus einer Server Component HTTP 500 bzw. ein
     * Serialisierungsfehler — fuer typecheck, lint und build unsichtbar.
     * ⛔ DIE MENGE WIRD GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    for (const datei of gefunden) {
      const quelle = readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8");
      expect(quelle.trimStart().split("\n")[0]!.trim(), `${datei}: keine Direktive`).toMatch(
        /^["']use client["'];?$/,
      );
    }
  });

  it("keine Datei der Insel zieht _db/ oder drizzle-orm in den Browser", () => {
    /*
     * ⛔ DER FEHLER WAR IN V13 EINMAL GEBAUT, und alle fuenf Tore blieben gruen. ⛔ HIER IST
     * DIE GEFAHR NAMENTLICH: `_lib/csv/klassifizieren.ts` traegt die Typen dieser Insel UND
     * bezieht sich auf `_db/schema` — jeder Bezug dort MUSS ein `import type` sein, und ein
     * `import type` ist eine EIGENE Anweisung, kein `type` in einer gemischten Klammer. Die
     * Datei sagt es in ihrem eigenen Kopf (`_lib/csv/klassifizieren.ts:6-9`).
     * ⛔ UND `_lib/csv/einlesen.ts` GEHOERT NICHT HIERHER: dort laufen die Node-Bausteine —
     * das Einlesen ist Sache des Handlers.
     *
     * ⛔ ER FOLGT DEM IMPORTGRAPHEN, ER LIEST NICHT NUR DIE WURZELN (Ruling R-V11-3).
     * ⚠️ ER IST DIE UNTERGRENZE, NICHT DER BEWEIS: was das Bundle wirklich enthaelt, zeigt
     * erst `pnpm build` (V23).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    const WURZELN = gefunden.map((datei) => `${INSEL_ORDNER}/${datei}`);

    const BEZUG = /\b(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;

    function aufloesen(vonDatei: string, spezifizierer: string): string | null {
      if (!spezifizierer.startsWith(".")) return null;
      const basis = normalize(join(dirname(vonDatei), spezifizierer));
      for (const kandidat of [`${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts")]) {
        if (existsSync(kandidat)) return kandidat;
      }
      return null;
    }

    const gesehen = new Set<string>(WURZELN);
    const offen = [...WURZELN];
    const verstoesse: string[] = [];
    const gelesen = new Set<string>();

    const istServerModul = (datei: string): boolean =>
      /^["']use server["'];?$/.test(readFileSync(datei, "utf8").trimStart().split("\n")[0]!.trim());

    while (offen.length > 0) {
      const datei = offen.pop()!;
      if (istServerModul(datei)) continue;
      const quelle = ohneKommentare(readFileSync(datei, "utf8"));
      gelesen.add(datei);
      for (const treffer of quelle.matchAll(BEZUG)) {
        const nurTyp = treffer[1] !== undefined;
        const spezifizierer = treffer[3]!;
        if (nurTyp) continue;
        if (/^(?:drizzle-orm|node:|better-sqlite3|next\/headers)(?:\/|$)/.test(spezifizierer)) {
          verstoesse.push(`${datei}: Wertimport von ${spezifizierer}`);
          continue;
        }
        const ziel = aufloesen(datei, spezifizierer);
        if (ziel === null) continue;
        if (/[/\\]_db[/\\]/.test(ziel)) {
          verstoesse.push(`${datei}: Wertimport aus _db/ (${spezifizierer})`);
          continue;
        }
        if (!gesehen.has(ziel)) {
          gesehen.add(ziel);
          offen.push(ziel);
        }
      }
    }

    expect(
      WURZELN.filter((wurzel) => !gelesen.has(wurzel)),
      "der Walker hat eine Wurzel nicht gelesen — er ist nicht gelaufen",
    ).toEqual([]);
    expect(verstoesse).toEqual([]);
  });

  it("die Insel nimmt KEINE Props, und die Seite reicht auch keine", () => {
    /*
     * ⛔ `Spec:4506` fuehrt fuer Insel 4 als einzige der acht `{}` — der Assistent haelt
     * Schritt, Zuordnung, Vorschau und Ergebnis SELBST (`ImportWizard.tsx:88-92`). ⛔ EINE
     * PROP WAERE NICHT NUR UEBERFLUESSIG, SIE WAERE DIE FALSCHE GRENZE: alles, was die Seite
     * hier hineinreichte, waere serverseitig zum Zeitpunkt des ERSTEN Renderns gelesen und
     * stuende danach fest, waehrend der Assistent vier Schritte lang lebt.
     *
     * ⚠️ EINE FALSCHE PROPS-GRENZE IST FUER typecheck, lint UND build UNSICHTBAR — deshalb
     * dieser Quelltext-Fall und kein Typ.
     */
    const insel = ohneKommentare(readFileSync(QUELLE_INSEL, "utf8"));
    expect(insel, "die Insel nimmt einen Parameter").toMatch(
      /export function ImportAssistent\s*\(\s*\)/,
    );
    const seite = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(seite, "die Seite reicht der Insel eine Prop").toMatch(/<ImportAssistent\s*\/>/);
  });

  it("der Dateischritt geht an den Route Handler, nicht in eine Server Action", () => {
    /*
     * ⛔ ENTSCHEIDUNG **E-V16**: eine Server Action, die eine hochgeladene Datei nimmt, laeuft
     * gegen `experimental.serverActions.bodySizeLimit` (Vorgabe 1 MB), und `next.config.ts`
     * hebt sie nicht an. Der Fehler ist ein 413 auf jede etwas groessere CSV — bei gruenem
     * typecheck, lint und build.
     *
     * ⛔ UND DER AEUSSERE PFAD, nicht der innere: ein `fetch("/m/radio/admin/...")` erreicht
     * den Handler zwar auch, aber `_lib/routen.ts` fuehrt die AEUSSERE Form und
     * `_lib/routen.test.ts` misst genau diese als Rewrite. Dieselbe Trennung wie bei jedem
     * `href` (`_lib/nav.ts:9-11`) und beim Hausvorbild
     * (`aufgaben/_ui/NachweisFormular.tsx:98`).
     */
    const insel = ohneKommentare(readFileSync(QUELLE_INSEL, "utf8"));
    expect(insel, "der Dateischritt nennt den aeusseren Pfad des Handlers nicht").toContain(
      `"${HOCHLADEN}"`,
    );
    expect(insel, "der Dateischritt nennt den INNEREN Pfad — _lib/routen.ts fuehrt den aeusseren")
      .not.toMatch(/["']\/m\/radio\/admin\/import\/hochladen["']/);
    expect(insel, "der Dateischritt laeuft nicht als POST").toMatch(/method:\s*"POST"/);
  });

  it("die neunzehn importierbaren Felder haben je eine Beschriftung und je ein Auswahlfeld", async () => {
    /*
     * ⛔ NEUNZEHN ZEILEN, JE EIN `Select` — 1:1 `ImportWizard.tsx:179-206` ueber
     * `IMPORTABLE_FIELDS`. ⛔ DIE ZAHL WIRD GELESEN UND NICHT ABGESCHRIEBEN: sie faellt aus
     * `IMPORTIERBARE_FELDER` (`_lib/csv/kopfzeilen.ts:32-52`), und eine zweite Abschrift hier
     * waere die Stelle, an der ein zwanzigstes Feld still unzuordnenbar bliebe.
     */
    await mount(<ImportAssistent />);
    await legeDateiAb();

    expect(IMPORTIERBARE_FELDER.length, "die Feldliste selbst ist geschrumpft").toBe(19);
    for (const feld of IMPORTIERBARE_FELDER) {
      expect(exists(`[data-rolle="radio-import-wahl-${feld}"]`), `${feld} hat kein Auswahlfeld`)
        .toBe(true);
    }
    expect(queryAll('[data-rolle^="radio-import-wahl-"]').length).toBe(
      IMPORTIERBARE_FELDER.length,
    );
  });
});
