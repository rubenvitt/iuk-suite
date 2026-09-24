// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, exists, existsPortal, fill, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { reportBrowserExport } from "@/core/audit/browser";
import { versiegele } from "../../_lib/kern/block";
import { zuBase64, zufall } from "../../_lib/kern/bytes";
import { entschluesseleExport, verschluesseleExport } from "../../_lib/kern/export";
import type { Exportdatei } from "../../_lib/kern/format";
import { beispielEinsatz, kopf } from "../../_lib/kern/testhilfe";
import { erzeugeSchluesselpaar, schluesselIdVon } from "../../_lib/kern/umschlag";
import { INHALT_BESCHAEDIGT, KENNWORT_FALSCH, MAX_DATEIGROESSE, ZU_GROSS } from "../../_lib/reader/oeffnen";
import { Fehlergrenze } from "./Fehlergrenze";
import { Reader } from "./Reader";

vi.mock("@/core/audit/browser", () => ({ reportBrowserExport: vi.fn() }));

const erwartet = JSON.parse(
  readFileSync(path.join(__dirname, "../../_lib/kern/testvektoren/erwartet.json"), "utf8"),
) as { export: Exportdatei };
const VEKTOR = JSON.stringify(erwartet.export);
const KW = "testvektor-kennwort";
// PBKDF2 mit 600 000 Runden: in Node ≈ 0,5 s je Ableitung, unter Last deutlich mehr.
const LANG = 20_000;

/** jsdom kennt `isSecureContext` nicht (`undefined`) — der Reader verlangt ausdrücklich `true`. */
function sicher(wert: boolean) {
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: wert });
}

beforeEach(() => {
  sicher(true);
  document.documentElement.dataset.zeitzone = "Europe/Berlin";
  vi.mocked(reportBrowserExport).mockClear();
});
afterEach(unmount);

/** Eine Datei über das versteckte Feld wählen — jsdom kann `input.files` nicht setzen, also per `defineProperty`. */
async function waehle(name: string, text: string, size = text.length, lies = async () => text) {
  const input = query<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, "files", { configurable: true, value: [{ name, size, text: lies }] });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}

function knopf(text: string, wurzel: ParentNode = document.body): HTMLButtonElement {
  const k = Array.from(wurzel.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === text);
  if (!k) throw new Error(`Knopf „${text}“ fehlt`);
  return k;
}

/**
 * Wartet auf Lesen und PBKDF2. Bewusst kein `vi.waitFor` INNERHALB von `act`: React hält die
 * Zustandsänderungen bis zum Ende des `act`-Rahmens zurück, die Bedingung sähe den neuen
 * Zustand nie. Deshalb kurze `act`-Takte und die Prüfung dazwischen.
 */
async function warte(bedingung: () => void) {
  const ende = Date.now() + 15_000;
  for (;;) {
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    try { bedingung(); return; } catch (e) { if (Date.now() > ende) throw e; }
  }
}

async function oeffne(name: string, text: string, kennwort: string) {
  await waehle(name, text);
  await warte(() => expect(exists('input[type="password"]')).toBe(true));
  await fill('input[type="password"]', kennwort);
  await clickElement(knopf("Entschlüsseln"));
}

describe("Reader", () => {
  it("zeigt nach der Wahl der Vektordatei die Kennwortkarte mit dem Kopf der Datei", async () => {
    await mount(<Reader bereitschaft="DRK-Bereitschaft Uelzen" />);
    await waehle("probe.einsatzbuch", VEKTOR);
    await warte(() => expect(exists("[data-kopftext]")).toBe(true));
    expect(query("[data-dateiname]").textContent).toBe("probe.einsatzbuch");
    expect(query("[data-kopftext]").textContent).toBe("Exportiert 24.9.2026, 10:00 Uhr · DRK-Bereitschaft Uelzen · Block 1–3 · 3 Einsätze");
    expect(query("label").textContent).toBe("Kennwort");
    expect(knopf("Entschlüsseln").disabled).toBe(true);
  });

  it("weist eine fremde Datei mit dem Hinweis ab und bleibt bei der Drop-Zone", async () => {
    await mount(<Reader bereitschaft="B" />);
    await waehle("leer.json", "{}");
    await warte(() => expect(exists('[data-testid="reader-fehler"]')).toBe(true));
    expect(query('[data-testid="reader-fehler"]').textContent).toContain("„leer.json“ ist keine Einsatzbuch-Datei");
    expect(exists("[data-dropzone]")).toBe(true);
    expect(exists('input[type="password"]')).toBe(false);
  });

  it("ohne sicheren Kontext: Hinweis auf https:// statt der Drop-Zone, keine Dateiwahl", async () => {
    sicher(false);
    await mount(<Reader bereitschaft="B" />);
    const hinweis = query('[data-testid="reader-unsicher"]');
    expect(hinweis.textContent).toContain("Der Reader braucht eine sichere Verbindung");
    expect(hinweis.textContent).toContain("Öffne die Suite über https://, dann kann der Browser die Datei entschlüsseln.");
    expect(exists("[data-dropzone]")).toBe(false);
    expect(exists('input[type="file"]')).toBe(false);
  });

  it("weist eine zu große Datei ab, ohne sie zu lesen", async () => {
    const lies = vi.fn(async () => VEKTOR);
    await mount(<Reader bereitschaft="B" />);
    await waehle("riesig.einsatzbuch", VEKTOR, MAX_DATEIGROESSE + 1, lies);
    await warte(() => expect(exists('[data-testid="reader-fehler"]')).toBe(true));
    expect(query('[data-testid="reader-fehler"]').textContent).toBe(ZU_GROSS);
    expect(lies).not.toHaveBeenCalled();
    expect(exists('input[type="password"]')).toBe(false);
  });

  it("zeigt keine Beispieldatei", async () => {
    await mount(<Reader bereitschaft="B" />);
    expect(document.body.textContent).not.toContain("Beispieldatei");
    expect(document.body.textContent).toContain("Nichts wird hochgeladen");
  });

  it("öffnet die Vektordatei, meldet das Öffnen einmal und zeigt Kette und neuesten Einsatz", async () => {
    await mount(<Reader bereitschaft="B" />);
    await oeffne("probe.einsatzbuch", VEKTOR, KW);
    await warte(() => expect(exists('[aria-label="Einsatzkette"]')).toBe(true));

    expect(reportBrowserExport).toHaveBeenCalledTimes(1);
    expect(reportBrowserExport).toHaveBeenCalledWith({ module: "einsatzbuch", format: "reader_oeffnen", von: 1, bis: 3, anzahl: 3 });

    expect(query("h2").textContent).toBe("3 Einsätze · Block 1–3");
    // Neueste oben, der neueste Block ist vorausgewählt.
    expect(queryAll("[data-block]").map((b) => b.dataset.block)).toEqual(["3", "2", "1"]);
    expect(query('[data-block="3"]').getAttribute("aria-pressed")).toBe("true");
    expect(exists('section[aria-label="Block 3"]')).toBe(true);
    expect(query("[data-fuss]").textContent).toBe("Block 0 · Anfang der Kette");
    expect(query("[data-kettenpruefung]").textContent).toContain("Kette intakt");
    expect(query("[data-anker]").textContent).toContain("Anker laut Datei: Block 3");
    expect(query("[data-herkunft]").textContent).toMatch(/ · exportiert 24\.9\.2026, 10:00 Uhr/);
    expect(exists('[role="status"]')).toBe(false);
    // Das Kennwort bleibt nicht im Zustand stehen.
    expect(exists('input[type="password"]')).toBe(false);
  }, LANG);

  it("meldet ein falsches Kennwort unter dem Feld und bleibt bei der Kennwortkarte", async () => {
    await mount(<Reader bereitschaft="B" />);
    await oeffne("probe.einsatzbuch", VEKTOR, "falsch-falsch");
    await warte(() => expect(exists("[data-kennwort-fehler]")).toBe(true));
    expect(query("[data-kennwort-fehler]").textContent).toBe(KENNWORT_FALSCH);
    expect(reportBrowserExport).not.toHaveBeenCalled();
  }, LANG);

  it("„Datei schließen“ verwirft alles und führt zurück zur Drop-Zone", async () => {
    await mount(<Reader bereitschaft="B" />);
    await oeffne("probe.einsatzbuch", VEKTOR, KW);
    await warte(() => expect(exists('[aria-label="Einsatzkette"]')).toBe(true));
    await clickElement(knopf("Datei schließen"));
    expect(exists("[data-dropzone]")).toBe(true);
    expect(exists('[aria-label="Einsatzkette"]')).toBe(false);
  }, LANG);

  it("„PDF erzeugen“ öffnet das Berichtsblatt als Overlay; „Als PDF speichern“ druckt und meldet den Block", async () => {
    const drucke = vi.spyOn(window, "print").mockImplementation(() => {});
    try {
      await mount(<Reader bereitschaft="DRK-Bereitschaft Uelzen" />);
      await oeffne("probe.einsatzbuch", VEKTOR, KW);
      await warte(() => expect(exists('[aria-label="Einsatzkette"]')).toBe(true));
      await clickElement(knopf("PDF erzeugen"));
      expect(existsPortal("[data-bericht]")).toBe(true);
      const steuer = queryPortal("[data-druck-steuer]");
      expect(document.activeElement).toBe(knopf("Als PDF speichern", steuer));
      expect(steuer.textContent).toContain("Im Druckdialog „Als PDF speichern“ wählen.");
      expect(queryPortal("[data-bericht]").textContent).toContain("DRK-Bereitschaft Uelzen");
      expect(queryPortal("[data-bericht]").textContent).toContain("Kette intakt (geprüft im Reader)");

      await clickElement(knopf("Als PDF speichern", steuer));
      expect(drucke).toHaveBeenCalledTimes(1);
      expect(reportBrowserExport).toHaveBeenLastCalledWith({ module: "einsatzbuch", format: "reader_druck", von: 3, bis: 3, anzahl: 1 });

      await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
      expect(existsPortal("[data-bericht]")).toBe(false);
      expect(document.activeElement).toBe(knopf("PDF erzeugen"));
    } finally {
      drucke.mockRestore();
    }
  }, LANG);

  it("umgestellte Datei: Anzeige nach Blocknummer, die Kette bleibt gebrochen", async () => {
    const inhalt = await entschluesseleExport(erwartet.export, KW);
    const datei = await verschluesseleExport({ ...inhalt, bloecke: [...inhalt.bloecke].reverse() }, KW, erwartet.export.kopf);
    await mount(<Reader bereitschaft="B" />);
    await oeffne("umgestellt.einsatzbuch", JSON.stringify(datei), KW);
    await warte(() => expect(exists('[aria-label="Einsatzkette"]')).toBe(true));
    expect(queryAll("[data-block]").map((b) => b.dataset.block)).toEqual(["3", "2", "1"]);
    expect(query('[data-block="3"]').getAttribute("aria-pressed")).toBe("true");
    expect(query("[data-fuss]").textContent).toBe("Block 0 · Anfang der Kette");
    expect(query("[data-kettenpruefung]").textContent).toContain("Gebrochen bei Block");
  }, LANG);

  it("gebrochene Kette: Blatt ohne „(geprüft im Reader)“, Siegel nur für geprüfte Blöcke", async () => {
    const inhalt = await entschluesseleExport(erwartet.export, KW);
    const zwei = inhalt.bloecke[1];
    inhalt.bloecke[1] = { ...zwei, kopf: { ...zwei.kopf, versiegelt: "2026-08-29T19:34:00+02:00" } };
    await mount(<Reader bereitschaft="B" />);
    await oeffne("manipuliert.einsatzbuch", JSON.stringify(await verschluesseleExport(inhalt, KW, erwartet.export.kopf)), KW);
    await warte(() => expect(exists('[aria-label="Einsatzkette"]')).toBe(true));
    expect(query("[data-kettenpruefung]").textContent).toContain("Gebrochen bei Block 2");

    // Block 3 liegt hinter der Bruchstelle: nicht bestätigt.
    await clickElement(knopf("PDF erzeugen"));
    let blatt = queryPortal("[data-bericht]").textContent ?? "";
    expect(blatt).toContain("Unveränderlichkeit nicht bestätigt");
    expect(blatt).toContain("Gebrochen bei Block 2");
    expect(blatt).not.toContain("(geprüft im Reader)");
    await clickElement(knopf("Schließen", queryPortal("[data-druck-steuer]")));

    // Block 1 liegt vor der Bruchstelle: geprüft, also unverändert — der Zusatz fehlt trotzdem.
    await clickElement(query('[data-block="1"]'));
    await clickElement(knopf("PDF erzeugen"));
    blatt = queryPortal("[data-bericht]").textContent ?? "";
    expect(blatt).toContain("Unverändert seit der Versiegelung");
    expect(blatt).not.toContain("(geprüft im Reader)");
  }, LANG);

  it("zeigt das Testband, sobald ein Block `umgebung: \"test\"` trägt", async () => {
    const paar = await erzeugeSchluesselpaar();
    const cek = zufall(32);
    const b = await versiegele(beispielEinsatz(), kopf(1, "0".repeat(64), await schluesselIdVon(paar.publicKey), "test"), paar.publicKey,
      { cek, iv: zufall(12), umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: zufall(12) } });
    const datei = await verschluesseleExport(
      { bloecke: [b], schluessel: { "1": zuBase64(cek) }, exportiertVon: "Test", quelle: "Test", anker: null }, KW,
      { erstellt: "2026-09-24T10:00:00+02:00", umfang: "einzeln", von: 1, bis: 1, anzahl: 1, quelle: "Test" });

    await mount(<Reader bereitschaft="B" />);
    await oeffne("test.einsatzbuch", JSON.stringify(datei), KW);
    await warte(() => expect(exists('[aria-label="Einsatzkette"]')).toBe(true));
    expect(query('[role="status"]').textContent).toBe("Testdaten — kein echter Einsatz");
    expect(query("h2").textContent).toBe("1 Einsatz · Block 1");
  }, LANG);
});

describe("Fehlergrenze", () => {
  it("zeigt bei einem Renderfehler den Hinweis auf beschädigten Inhalt und „Datei schließen“", async () => {
    const schliessen = vi.fn();
    const Wirft = () => { throw new Error("kaputt"); };
    // React meldet den abgefangenen Fehler zusätzlich auf der Konsole — im Test nur Rauschen.
    const konsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await mount(<Fehlergrenze onSchliessen={schliessen}><Wirft /></Fehlergrenze>);
      expect(query("[data-fehlergrenze]").textContent).toContain(INHALT_BESCHAEDIGT);
      await clickElement(knopf("Datei schließen"));
      expect(schliessen).toHaveBeenCalledTimes(1);
    } finally {
      konsole.mockRestore();
    }
  });
});
