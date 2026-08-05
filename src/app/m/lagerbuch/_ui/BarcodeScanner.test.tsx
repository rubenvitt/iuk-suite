// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act } from "react";
import { mount, unmount, query, exists, fill, submitForm, click } from "@/app/m/qr/_lib/test-dom";
import { BarcodeScanner } from "./BarcodeScanner";

const QUELLE = "src/app/m/lagerbuch/_ui/BarcodeScanner.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). Die Scans unten lesen sonst den Rohtext INKLUSIVE
 * Kommentaren — und der vom Plan vorgeschriebene Kopfkommentar von
 * `BarcodeScanner.tsx` nennt BEIDE verbotenen Zeichenfolgen woertlich, als
 * Gegenbeispiel: den Namen des Verwaltungs-Stylesheets und eine antd-Variable
 * („waere ein Knopf OHNE Hintergrundfarbe"). Beide Scans waeren damit auf ihrer
 * eigenen Begruendung rot, und die naheliegende „Reparatur" waere, genau die
 * Begruendung zu loeschen, die konserviert werden soll.
 * `bauform.test.ts` exportiert die Funktion nicht, deshalb die lokale Kopie
 * statt eines Re-Exports.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/* ------------------------------------------------------------------ *
 * Die zxing-Buendel als Attrappe.
 *
 * Ohne sie sind die vier Kamerazustaende aus §7.6.3 UEBERHAUPT NICHT
 * pruefbar: jsdom hat kein `getUserMedia`, der einzige erreichbare Zustand
 * waere „kein sicherer Kontext". Genau das ist Befund 16 — der Plan prueft
 * ausschliesslich `sichererKontext(false)`, und E11 verbietet einen E2E als
 * Ersatz.
 *
 * Die Attrappe traegt zugleich die beiden Zusagen, die sonst nur ein
 * Quelltext-Scan behauptet hat: sie zeichnet die Hints-Map auf (die sieben
 * POSSIBLE_FORMATS) und haelt den Scan-Rueckruf fest, mit dem sich das
 * DAUERFEUER der Kamera nachstellen laesst — der einzige Auslöser, gegen den
 * die Doppelfeuer-Sperre ueberhaupt gebaut ist.
 * ------------------------------------------------------------------ */

type Ergebnis = { getText: () => string };
type Rueckruf = (r: Ergebnis | undefined) => void;
type Steuerung = { stop: () => void; switchTorch?: (an: boolean) => Promise<void> };

/**
 * Zaehlt, welche Buendel WIRKLICH geladen wurden. Vitest ruft eine
 * Mock-Fabrik LAZY beim ersten Import des Moduls und genau EINMAL pro
 * Testdatei (empirisch belegt, siehe Bericht). Damit ist „ohne sicheren
 * Kontext wird kein Buendel geladen" eine Verhaltensaussage und kein
 * Quelltext-Scan — sie verlangt aber, dass der erste Test der Datei sie
 * prueft. Deshalb steht er oben und sichert das ausdruecklich zu.
 */
const ladungen: string[] = [];
/** Jeder Kamerastart — `decodeFromConstraints`. */
let starts: number = 0;
/** Die Hints-Map, mit der der Leser gebaut wurde. */
let gebauteHints: Map<unknown, unknown>[] = [];
let scanRueckruf: Rueckruf | null = null;
let kameraWurf: unknown = null;
let steuerung: Steuerung = { stop: () => {} };

vi.mock("@zxing/browser", () => {
  ladungen.push("browser");
  return {
    BrowserMultiFormatReader: class {
      constructor(hints: Map<unknown, unknown>) {
        gebauteHints.push(hints);
      }
      async decodeFromConstraints(_c: unknown, _v: unknown, rueckruf: Rueckruf) {
        starts++;
        if (kameraWurf) throw kameraWurf;
        scanRueckruf = rueckruf;
        return steuerung;
      }
    },
  };
});

/**
 * Die Formatnamen kommen als ihr eigener Name zurueck — damit prueft die
 * Hints-Zusicherung unten die AUSWAHL der Komponente und nicht eine
 * Zeichenkette, die der Test selbst gebaut hat. Die vier Koeder (`CODE_93`,
 * `PDF_417`, `AZTEC`, `UPC_A`) fangen ein zusaetzlich eingebautes Format.
 */
vi.mock("@zxing/library", () => {
  ladungen.push("library");
  return {
    DecodeHintType: { POSSIBLE_FORMATS: "POSSIBLE_FORMATS" },
    BarcodeFormat: {
      CODE_128: "CODE_128", CODE_39: "CODE_39", EAN_13: "EAN_13", EAN_8: "EAN_8",
      ITF: "ITF", QR_CODE: "QR_CODE", DATA_MATRIX: "DATA_MATRIX",
      CODE_93: "CODE_93", PDF_417: "PDF_417", AZTEC: "AZTEC", UPC_A: "UPC_A",
    },
  };
});

/**
 * jsdom hat weder `isSecureContext` noch `navigator.mediaDevices`. Der
 * Vorgabezustand ist damit „kein sicherer Kontext" — und genau dieser Zustand
 * ist der, den §7.6.3 als ersten fordert. Fuer die uebrigen Zusagen wird er
 * gezielt gesetzt.
 *
 * ⚠️ ZWEI SCHALTER, NICHT EINER. Der Riegel im Quelltext ist ein ODER
 * (`!window.isSecureContext || !navigator.mediaDevices`), so wie §7.6.3 ihn
 * vorschreibt. Setzte dieser Helfer beide Eigenschaften aus EINEM Boolean,
 * liefen die beiden Arme nie auseinander: die Mutation `||` → `&&` bliebe in
 * jeder gefahrenen Konfiguration gruen, weil `sichererKontext(false)` beide
 * Arme wahr und `sichererKontext(true)` beide falsch macht. `medien` faellt
 * deshalb per Vorgabe auf `sicher` zurueck — die uebrigen Aufrufstellen
 * bleiben unveraendert —, und zwei Tests fahren die Arme einzeln.
 */
function sichererKontext(sicher: boolean, medien: boolean = sicher) {
  Object.defineProperty(window, "isSecureContext", { value: sicher, configurable: true });
  Object.defineProperty(navigator, "mediaDevices", {
    value: medien ? { getUserMedia: vi.fn() } : undefined,
    configurable: true,
  });
}

/* ------------------------------------------------------------------ *
 * Befund 17: `vi.spyOn(window.location, "assign")` WIRFT unter jsdom 26.
 * `assign` ist per WebIDL `[LegacyUnforgeable]`, also eine EIGENE, nicht
 * konfigurierbare und nicht schreibbare Dateneigenschaft der Location
 * (gemessen: `{writable:false, configurable:false}`). `vi.spyOn` arbeitet
 * ueber `Object.defineProperty` → „Cannot redefine property: assign"; eine
 * schlichte Zuweisung → „Cannot assign to read only property"; ein Proxy um
 * die echte Location → Verletzung der Proxy-Invariante. Der Wurf staende im
 * `beforeEach` und risse JEDEN Test der Datei ab.
 *
 * Was geht: `window.location` SELBST ist konfigurierbar (gemessen:
 * `{configurable:true}`). Der Platzhalter traegt die Felder, die jsdom und
 * React lesen koennten, als einfache Werte; die urspruengliche Beschreibung
 * wird in `afterEach` zurueckgelegt.
 * ------------------------------------------------------------------ */
let zugewiesen: string[] = [];
const echteLocationBeschreibung = Object.getOwnPropertyDescriptor(window, "location")!;

beforeEach(() => {
  zugewiesen = [];
  starts = 0;
  gebauteHints = [];
  scanRueckruf = null;
  kameraWurf = null;
  steuerung = { stop: vi.fn(), switchTorch: vi.fn(async () => {}) };
  const echt = window.location;
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      assign: (u: string | URL) => { zugewiesen.push(String(u)); },
      replace: () => {},
      reload: () => {},
      href: echt.href, origin: echt.origin, protocol: echt.protocol, host: echt.host,
      hostname: echt.hostname, port: echt.port, pathname: echt.pathname,
      search: echt.search, hash: echt.hash, ancestorOrigins: echt.ancestorOrigins,
      toString: () => echt.href,
    },
  });
});

afterEach(async () => {
  await unmount();
  Object.defineProperty(window, "location", echteLocationBeschreibung);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Mikrotasks durchlaufen lassen — der Kamerastart haengt an zwei `await`. */
async function ruhe(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Ein Bild der Kamera, in dem zxing einen Code erkennt. */
async function kameraMeldet(text: string): Promise<void> {
  await act(async () => {
    scanRueckruf?.({ getText: () => text });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const props = {
  zuBarcode: async (roh: string) => (roh === "SN-1" ? { id: "g1" } : null),
  zielPfad: (id: string) => `/verwaltung/geraete/${id}`,
};

async function mitKamerafehler(fehler: unknown): Promise<void> {
  kameraWurf = fehler;
  sichererKontext(true);
  await mount(<BarcodeScanner {...props} />);
  await ruhe();
}

describe("BarcodeScanner — der sichere Kontext wird VOR dem dynamischen Import geprueft", () => {
  /**
   * ⚠️ DIESER TEST MUSS DER ERSTE DER DATEI SEIN. Die Mock-Fabriken laufen
   * genau einmal; sobald ein anderer Test mit sicherem Kontext gemountet hat,
   * ist `ladungen` dauerhaft gefuellt. Die erste Zusicherung sagt das
   * ausdruecklich zu — bei einer Umsortierung wird der Test LAUT rot und nicht
   * still gruen.
   */
  it("ohne sicheren Kontext wird KEIN zxing-Buendel geladen — mit sicherem Kontext beide", async () => {
    expect(ladungen, "ein frueherer Test hat die Buendel schon geladen — dieser Test muss der erste sein")
      .toEqual([]);

    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();

    // Der Kern: sonst laedt das Geraet zwei Buendel, um danach festzustellen,
    // dass es sie nicht benutzen kann.
    expect(ladungen, "die Buendel wurden trotz unsicherem Kontext geladen").toEqual([]);
    expect(exists("video")).toBe(false);
    expect(exists("[data-rolle='scan-fehler']")).toBe(true);

    // Gegenprobe im selben Test: ohne sie koennte der Zaehler kaputt sein und
    // die Zusicherung oben waere leer-gruen.
    await unmount();
    sichererKontext(true);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    expect([...ladungen].sort()).toEqual(["browser", "library"]);
    expect(exists("video")).toBe(true);
  });
});

describe("BarcodeScanner — das manuelle Feld steht IMMER", () => {
  it("auch ohne sicheren Kontext, neben der Fehlerkarte", async () => {
    // 1:1-Pflicht (§7.6.3): heute wird es unbedingt gerendert, nur der
    // Videobereich wird ersetzt. Ein manuelles Feld, das sich hinter einem
    // Kamerafehler versteckt, ist kein Rueckfall.
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    expect(exists("[data-rolle='scan-manuell']")).toBe(true);
    expect(exists("[data-rolle='scan-fehler']")).toBe(true);
  });

  it("auch bei abgelehntem Kamerazugriff — und es ist dort BEDIENBAR, nicht nur vorhanden", async () => {
    // „Steht immer" ist erst dann ein Rueckfall, wenn es in genau dem Zustand
    // auch traegt. Ein bloßes `exists` bliebe gruen, wenn das Feld unter der
    // Fehlerkarte deaktiviert waere.
    await mitKamerafehler(new DOMException("nope", "NotAllowedError"));
    expect(exists("[data-rolle='scan-fehler']")).toBe(true);
    await fill("[data-rolle='scan-manuell']", "SN-1");
    await submitForm("[data-rolle='scan-form']");
    expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);
  });
});

describe("BarcodeScanner — vier Kamerazustaende statt einem (§7.6.3)", () => {
  it("kein sicherer Kontext nennt die verschluesselte Verbindung, nicht 'Kamera nicht verfuegbar'", async () => {
    // Ueber den direkten Weg (http://<ip>:<port>) ist getUserMedia GAR NICHT
    // verfuegbar (§3.5.2). Der Text sagt das ausdruecklich, weil die Handlung
    // eine andere ist als bei einer abgelehnten Freigabe.
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Die Kamera braucht eine verschlüsselte Verbindung. " +
      "Bitte die Seite über die normale Adresse aufrufen, nicht über die IP.",
    );
  });

  /**
   * ⚠️ DIE BEIDEN ARME DES ODER, EINZELN GEFAHREN. §7.6.3 schreibt
   * `!window.isSecureContext` ODER `!navigator.mediaDevices` vor. Solange
   * beide Eigenschaften nur gemeinsam gesetzt werden, traegt kein Test das
   * Oder: die Mutation `||` → `&&` bleibt gruen, weil beide Arme immer
   * dasselbe sagen. Diese zwei Tests fahren sie auseinander — und jeder haelt
   * genau einen Arm ALLEIN (Regel 4): faellt `!window.isSecureContext` aus
   * dem Riegel, wird nur der zweite rot; faellt `!navigator.mediaDevices`
   * aus, nur der erste.
   *
   * ⚠️ Sie pruefen ausdruecklich NICHT auf `ladungen` — die Mock-Fabriken
   * laufen einmal pro Testdatei, das Feld ist hier dauerhaft gefuellt. Die
   * beobachtbare Wirkung ist stattdessen: der erste Zustandstext steht da,
   * und es gibt KEIN `<video>` (der Riegel greift also vor dem Import).
   */
  it("HTTPS ohne `navigator.mediaDevices` ist auch kein sicherer Kontext", async () => {
    // Der reale Fall: eine eingebettete Webview oder ein aelterer Safari-Stand
    // auf HTTPS, der `navigator.mediaDevices` nicht freigibt. Unter einem `&&`
    // fiele das Geraet durch den Riegel, luede beide zxing-Buendel und bekaeme
    // am Ende den generischen Satz „Die Kamera ist nicht verfuegbar" — die
    // falsche Auskunft in der Fahrzeughalle.
    sichererKontext(true, false);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    expect(exists("[data-rolle='scan-fehler']"), "der Riegel hat nicht gegriffen").toBe(true);
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Die Kamera braucht eine verschlüsselte Verbindung. " +
      "Bitte die Seite über die normale Adresse aufrufen, nicht über die IP.",
    );
    expect(exists("video"), "der Videobereich steht trotz gegriffenem Riegel").toBe(false);
  });

  it("unverschluesselt MIT `navigator.mediaDevices` ist ebenfalls kein sicherer Kontext", async () => {
    // Die Umkehrung: `http://<ip>:<port>` in einem Browser, der das Objekt
    // trotzdem fuehrt. `getUserMedia` ist dort nicht benutzbar (§3.5.2).
    sichererKontext(false, true);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    expect(exists("[data-rolle='scan-fehler']"), "der Riegel hat nicht gegriffen").toBe(true);
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Die Kamera braucht eine verschlüsselte Verbindung. " +
      "Bitte die Seite über die normale Adresse aufrufen, nicht über die IP.",
    );
    expect(exists("video"), "der Videobereich steht trotz gegriffenem Riegel").toBe(false);
  });

  it("NotAllowedError nennt die Browser-Einstellungen", async () => {
    await mitKamerafehler(new DOMException("abgelehnt", "NotAllowedError"));
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen für diese Seite " +
      "freigeben — oder den Barcode unten eintippen.",
    );
  });

  it("SecurityError liest sich wie NotAllowedError — dieselbe Handlung", async () => {
    await mitKamerafehler(new DOMException("blockiert", "SecurityError"));
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Der Kamerazugriff wurde abgelehnt. In den Browser-Einstellungen für diese Seite " +
      "freigeben — oder den Barcode unten eintippen.",
    );
  });

  it("NotFoundError nennt die fehlende Rueckkamera", async () => {
    await mitKamerafehler(new DOMException("keine", "NotFoundError"));
    expect(query("[data-rolle='scan-fehler']").textContent)
      .toBe("Keine Rückkamera gefunden. Barcode bitte unten eintippen.");
  });

  it("OverconstrainedError zaehlt als fehlende Kamera", async () => {
    await mitKamerafehler(new DOMException("facingMode", "OverconstrainedError"));
    expect(query("[data-rolle='scan-fehler']").textContent)
      .toBe("Keine Rückkamera gefunden. Barcode bitte unten eintippen.");
  });

  it("NotReadableError nennt die andere App", async () => {
    await mitKamerafehler(new DOMException("belegt", "NotReadableError"));
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Die Kamera wird gerade von einer anderen App benutzt. " +
      "Diese schließen oder den Barcode unten eintippen.",
    );
  });

  it("AbortError zaehlt als belegte Kamera", async () => {
    await mitKamerafehler(new DOMException("abgebrochen", "AbortError"));
    expect(query("[data-rolle='scan-fehler']").textContent).toBe(
      "Die Kamera wird gerade von einer anderen App benutzt. " +
      "Diese schließen oder den Barcode unten eintippen.",
    );
  });

  it("ein unbekannter Fehler behauptet NICHT, der Zugriff sei abgelehnt worden", async () => {
    // Der Rueckfall des Bestands, aber ohne die falsche Behauptung „Zugriff
    // abgelehnt" — die drei Faelle darueber decken das ab.
    await mitKamerafehler(new Error("irgendwas"));
    expect(query("[data-rolle='scan-fehler']").textContent)
      .toBe("Die Kamera ist nicht verfügbar. Barcode bitte unten eintippen.");
  });
});

describe("BarcodeScanner — die manuelle Suche", () => {
  it("findet einen Treffer und navigiert HART auf den aeusseren Pfad", async () => {
    // window.location.assign statt router.push: Soft-Navigation direkt nach
    // einer Server Action wird gern abgebrochen.
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    await fill("[data-rolle='scan-manuell']", "SN-1");
    await submitForm("[data-rolle='scan-form']");
    expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);
  });

  it("normalisiert die Eingabe ueber `normalisiereBarcode`", async () => {
    // Ein aus einem QR getippter Deep-Link findet sein Geraet nur so.
    const gesehen: string[] = [];
    sichererKontext(false);
    await mount(
      <BarcodeScanner
        zielPfad={props.zielPfad}
        zuBarcode={async (roh) => { gesehen.push(roh); return roh === "SN-1" ? { id: "g1" } : null; }}
      />,
    );
    await fill("[data-rolle='scan-manuell']", "  https://alt.example/g/SN-1  ");
    await submitForm("[data-rolle='scan-form']");
    expect(gesehen).toEqual(["SN-1"]);
    expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);
  });

  it("ein unbekannter Code zeigt den Nicht-Treffer-Text und navigiert NICHT", async () => {
    sichererKontext(false);
    await mount(<BarcodeScanner {...props} />);
    await fill("[data-rolle='scan-manuell']", "ZZZ");
    await submitForm("[data-rolle='scan-form']");
    expect(query("[data-rolle='scan-meldung']").textContent)
      .toBe("Kein Gerät mit dem Barcode „ZZZ“ gefunden.");
    expect(zugewiesen).toEqual([]);
  });

  it("`nichtGefunden` ist optional MIT Vorgabe — ein eigener Text wird benutzt", async () => {
    // Der Zwei-Prop-Aufruf steht in Teil 5, T138 bereits geschrieben. Ein
    // dritter PFLICHT-Prop braeche beide Verwaltungsseiten; die uebrigen Tests
    // dieser Datei fahren ihn deshalb durchweg zweiprop.
    sichererKontext(false);
    await mount(
      <BarcodeScanner {...props} nichtGefunden={(code) => `Keine BZ zu ${code}.`} />,
    );
    await fill("[data-rolle='scan-manuell']", "ZZZ");
    await submitForm("[data-rolle='scan-form']");
    expect(query("[data-rolle='scan-meldung']").textContent).toBe("Keine BZ zu ZZZ.");
  });

  it("ein geworfener Lookup wird gefangen — kein Absturz mitten im Scannen", async () => {
    sichererKontext(false);
    await mount(
      <BarcodeScanner zielPfad={props.zielPfad} zuBarcode={async () => { throw new Error("weg"); }} />,
    );
    await fill("[data-rolle='scan-manuell']", "SN-1");
    await submitForm("[data-rolle='scan-form']");
    expect(query("[data-rolle='scan-meldung']").textContent)
      .toBe("Suche fehlgeschlagen – bitte erneut versuchen.");
    expect(zugewiesen).toEqual([]);
  });

  it("ein leeres Feld loest gar nichts aus", async () => {
    const zuBarcode = vi.fn(async () => null);
    sichererKontext(false);
    await mount(<BarcodeScanner zielPfad={props.zielPfad} zuBarcode={zuBarcode} />);
    await submitForm("[data-rolle='scan-form']");
    expect(zuBarcode).not.toHaveBeenCalled();
  });
});

describe("BarcodeScanner — die Doppelfeuer-Sperre (1:1, §7.6.3)", () => {
  /**
   * ⚠️ BEFUND 16. Der Plan fuhr diese beiden Zusagen ueber die MANUELLE
   * Absendung — und die setzt `busyRef` unmittelbar davor selbst zurueck. Ob
   * die Sperre zwei Sekunden, null Sekunden oder gar nicht existierte, aenderte
   * am Ergebnis nichts. Der Auslöser, gegen den die Sperre gebaut ist, ist das
   * DAUERFEUER DER KAMERA: zxing meldet denselben Code viele Male pro Sekunde.
   * Deshalb laufen beide Tests hier ueber den Scan-Rueckruf.
   */
  it("sperrt einen unbekannten Code fuer 2 Sekunden — 1,9 s reichen NICHT", async () => {
    vi.useFakeTimers();
    const zuBarcode = vi.fn(async () => null);
    sichererKontext(true);
    await mount(<BarcodeScanner zielPfad={props.zielPfad} zuBarcode={zuBarcode} />);
    await ruhe();
    expect(scanRueckruf, "die Kamera ist gar nicht angelaufen — der Test misst nichts").not.toBeNull();

    await kameraMeldet("ZZZ");
    expect(zuBarcode).toHaveBeenCalledTimes(1);

    // Dasselbe Bild, Millisekunden spaeter. Ohne die Sperre liefen hier drei
    // parallele Lookups, und die Meldung flackerte.
    await kameraMeldet("ZZZ");
    await kameraMeldet("ZZZ");
    expect(zuBarcode, "die Sperre haelt das Dauerfeuer nicht").toHaveBeenCalledTimes(1);

    // Die 1,9 s sind das, was aus „irgendeine Sperre" ZWEI SEKUNDEN macht.
    await vi.advanceTimersByTimeAsync(1900);
    await kameraMeldet("ZZZ");
    expect(zuBarcode, "nach 1,9 s steht die Sperre noch").toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(200);
    await kameraMeldet("ZZZ");
    expect(zuBarcode, "nach 2 s ist sie gefallen").toHaveBeenCalledTimes(2);
  });

  it("nach einem Treffer bleibt `busy` gesetzt — sonst navigiert ein Folge-Scan doppelt", async () => {
    vi.useFakeTimers();
    sichererKontext(true);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    expect(scanRueckruf).not.toBeNull();

    await kameraMeldet("SN-1");
    expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);

    // Weit ueber die 2-Sekunden-Sperre hinaus: nach einer Navigation darf sie
    // GAR NICHT mehr fallen. Der Aufkleber liegt oft noch im Bild.
    await vi.advanceTimersByTimeAsync(5000);
    await kameraMeldet("SN-1");
    await kameraMeldet("SN-1");
    expect(zugewiesen, "genau EINE Navigation").toEqual(["/verwaltung/geraete/g1"]);
  });

  it("die manuelle Absendung hebt die Sperre auf — der Mensch am Feld ist nicht das Dauerfeuer", async () => {
    vi.useFakeTimers();
    const zuBarcode = vi.fn(async (roh: string) => (roh === "SN-1" ? { id: "g1" } : null));
    sichererKontext(true);
    await mount(<BarcodeScanner zielPfad={props.zielPfad} zuBarcode={zuBarcode} />);
    await ruhe();

    await kameraMeldet("ZZZ");           // setzt die Sperre fuer 2 Sekunden
    expect(zuBarcode).toHaveBeenCalledTimes(1);

    // OHNE jeden Zeitvorlauf: wer aufgibt und tippt, wartet nicht zwei Sekunden.
    await fill("[data-rolle='scan-manuell']", "SN-1");
    await submitForm("[data-rolle='scan-form']");
    expect(zuBarcode, "die manuelle Absendung wurde von der Sperre verschluckt")
      .toHaveBeenCalledTimes(2);
    expect(zugewiesen).toEqual(["/verwaltung/geraete/g1"]);
  });
});

describe("BarcodeScanner — die Kamera laeuft durch", () => {
  it("ein Tastendruck im manuellen Feld startet die Kamera NICHT neu", async () => {
    // Der Aufraeumer des Effekts stoppt die Kamera. Haengt der Effekt an einer
    // Funktionsidentitaet, die sich bei jedem Rendern aendert, wird die Kamera
    // bei JEDEM Zeichen im Tippfeld gestoppt und neu erlaubt — sichtbar als
    // Ruckeln, auf iOS als Freigabedialog.
    sichererKontext(true);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    expect(starts).toBe(1);

    await fill("[data-rolle='scan-manuell']", "S");
    await fill("[data-rolle='scan-manuell']", "SN");
    await fill("[data-rolle='scan-manuell']", "SN-");
    await ruhe();

    expect(starts, "die Kamera wurde beim Tippen neu gestartet").toBe(1);
    expect(steuerung.stop).not.toHaveBeenCalled();
  });

  it("stoppt die Kamera beim Abbau", async () => {
    // Ohne den Halt im Aufraeumer laeuft die Kamera nach dem Verlassen der
    // Seite weiter — sichtbar an der Geraete-Leuchte, und auf iOS blockiert sie
    // dann jede weitere App.
    sichererKontext(true);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    expect(steuerung.stop).not.toHaveBeenCalled();
    await unmount();
    expect(steuerung.stop).toHaveBeenCalled();
  });
});

describe("BarcodeScanner — die sieben Formate und der Taschenlampenschalter", () => {
  it("meldet zxing GENAU die sieben POSSIBLE_FORMATS — in dieser Reihenfolge", async () => {
    // 1:1-Pflicht (§7.6.2). EAN und ITF sind reine Handels- und
    // Herstellercodierungen; sie stehen auf keinem lagerbuch-Etikett, sondern
    // vom Hersteller gedruckt am Geraet. Ein Format zu entfernen macht jeden
    // bereits erfassten Hersteller-Barcode unlesbar, und die Gegenstaende sind
    // physisch vorhanden. Ein Format hinzuzufuegen ist harmlos, aber
    // unbegruendet — die vier Koeder in der Attrappe fangen es.
    sichererKontext(true);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    expect(gebauteHints.length, "der Leser wurde gar nicht gebaut").toBe(1);
    expect(gebauteHints[0]!.get("POSSIBLE_FORMATS")).toStrictEqual([
      "CODE_128", "CODE_39", "EAN_13", "EAN_8", "ITF", "QR_CODE", "DATA_MATRIX",
    ]);
  });

  it("schaltet die Taschenlampe und meldet den Zustand als `aria-pressed`", async () => {
    sichererKontext(true);
    await mount(<BarcodeScanner {...props} />);
    await ruhe();
    const schalter = "button[aria-label='Taschenlampe']";
    expect(query(schalter).getAttribute("aria-pressed")).toBe("false");

    await click(schalter);
    expect(steuerung.switchTorch).toHaveBeenCalledWith(true);
    expect(query(schalter).getAttribute("aria-pressed")).toBe("true");

    await click(schalter);
    expect(steuerung.switchTorch).toHaveBeenCalledWith(false);
    expect(query(schalter).getAttribute("aria-pressed")).toBe("false");
  });

  it("ein Geraet ohne `switchTorch` stuerzt beim Antippen NICHT ab", async () => {
    // 1:1 (§7.6): nicht jedes Geraet und nicht jeder Browser kann es, und ein
    // Wurf beim Antippen waere ein Absturz mitten im Scannen.
    //
    // Der Wurf ist hier die EINZIGE beobachtbare Wirkung: mit Riegel wie ohne
    // bliebe `aria-pressed` auf "false". React 19 meldet einen Wurf aus einem
    // Ereignisbehandler ueber `reportError`, und jsdom macht daraus ein
    // `error`-Ereignis am Fenster (gemessen, siehe Bericht) — daran haengt
    // diese Zusicherung.
    steuerung = { stop: vi.fn() };
    const fehler: string[] = [];
    const hoerer = (ev: ErrorEvent) => { fehler.push(String(ev.message)); };
    window.addEventListener("error", hoerer);
    try {
      sichererKontext(true);
      await mount(<BarcodeScanner {...props} />);
      await ruhe();
      await click("button[aria-label='Taschenlampe']");
      expect(fehler, "das Antippen hat geworfen").toEqual([]);
      expect(query("button[aria-label='Taschenlampe']").getAttribute("aria-pressed")).toBe("false");
    } finally {
      window.removeEventListener("error", hoerer);
    }
  });
});

describe("BarcodeScanner — Bauform, und die Regeln, die kein Gate findet", () => {
  it("faerbt aus `--lb-*`, NIE aus `--ant-*` (Falle 2)", () => {
    // ⚠️ ohneKommentare(): der vom Plan vorgeschriebene Kopfkommentar nennt
    // `--ant-color-…` woertlich als Gegenbeispiel. Der Rohtext-Scan waere auf
    // seiner eigenen Begruendung rot.
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toContain("--ant-");
  });

  it("greift auf KEINE Klasse aus `verwaltung.module.css` zu — er rendert auf beiden Aesten", () => {
    // Die Verwaltungsseiten tragen `.modul` als Traeger, der Helfer-Weg
    // `.rahmen`. Beide fuehren denselben --lb-Satz; eine Klasse aus dem fremden
    // Stylesheet waere dort undefiniert und hier still ungestylt.
    expect(ohneKommentare(readFileSync(QUELLE, "utf8"))).not.toMatch(/verwaltung\.module\.css/);
  });

  it("importiert zxing DYNAMISCH — die Buendel laden erst beim Betreten der Seite", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/await Promise\.all\(\[\s*import\("@zxing\/browser"\)/);
    // ⚠️ `import type` ist AUSGENOMMEN und muss es sein: der Typ-Import von
    // `IScannerControls` wird beim Uebersetzen restlos entfernt und zieht kein
    // Buendel. `ohneKommentare()` hilft hier NICHT — die Zeile ist Code, kein
    // Kommentar.
    expect(q).not.toMatch(/^import (?!type )[^\n]*from "@zxing\/(browser|library)"/m);
  });

  it("ist eine Client-Insel ohne antd", () => {
    const q = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(q).toMatch(/^"use client";/m);
    expect(q).not.toMatch(/from "antd|@ant-design\/icons|lucide-react/);
  });
});
