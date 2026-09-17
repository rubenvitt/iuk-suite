// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, exists, query } from "@/app/m/qr/_lib/test-dom";
import type { BoxPosten } from "../../../_lib/lesepfade/entnahmebox";
import { BoxAnsicht, type EinheitOption, type ZugangZeile } from "./BoxAnsicht";

/**
 * DIE VERWALTUNGSINSEL DER ENTNAHMEBOX — DRK-314.
 *
 * ⚠️ DIE ACTION WIRD GEMOCKT, WEIL SIE HIER IMPORTIERT WIRD: ein
 * `"use server"`-Modul unter jsdom zoege `next/headers` und die Datenbank mit.
 * Was die Insel SCHICKT, prueft `_actions/entnahmebox.test.ts` gegen eine echte
 * SQLite. ⚠️ HIER STAND „anders als bei `BoxAbgabe`, wo sie als Prop
 * hereinkommt" — seit DRK-375 importiert auch `_ui/BoxAbgabe.tsx` direkt, und
 * `BoxAbgabe.test.tsx` mockt auf genau diese Weise.
 */
vi.mock("../../../_actions/entnahmebox", () => ({
  bucheInEntnahmebox: vi.fn(async () => ({ ok: true, wert: { gebucht: 1 } })),
}));

/*
 * ⚠️ OHNE DIESE ATTRAPPE WIRFT SCHON DAS MOUNTEN: `useRouter` und
 * `usePathname` verlangen einen montierten App-Router („invariant expected app
 * router to be mounted"), und die Insel liest beide — `router.refresh()` nach
 * einer gelungenen Buchung, `useUrlFilter` fuer die Wahl der Einheit. Dieselbe
 * Form wie in `lagerorte/LagerorteListe.test.tsx`.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, replace: () => {} }),
  usePathname: () => "/verwaltung/entnahmebox",
}));

const QUELLE = "src/app/m/lagerbuch/verwaltung/(arbeit)/entnahmebox/BoxAnsicht.tsx";

const EINHEITEN: EinheitOption[] = [
  { id: "fz-1", name: "RTW 1", kennung: "MS-DRK-1", einheitenart: "fahrzeug", aktiv: true },
];

const POSTEN: BoxPosten[] = [{
  artikelId: "art-1", artikelName: "Kühlkompresse", einheit: "Stk", menge: 6,
  chargen: [
    { id: "ch-1", chargenNr: "L-100", verfall: "2030-01", rest: 6, ampel: "gruen", text: "bis 01/30" },
  ],
  gemeldet: null,
}];

const ZUGAENGE: ZugangZeile[] = [{
  buchungId: "b-1", zeit: "16.09.2026, 08:47", artikelName: "Kühlkompresse",
  menge: 2, einheit: "Stk", herkunft: "RTW 1 · Fahrzeug · MS-DRK-1", wer: "A. Verwaltung",
}];

function ansicht(teil: Partial<Parameters<typeof BoxAnsicht>[0]> = {}) {
  return (
    <BoxAnsicht
      boxName="Entnahmebox"
      nimmtAuf
      einheiten={EINHEITEN}
      gewaehltId=""
      quellPosten={[]}
      inhalt={POSTEN}
      zugaenge={ZUGAENGE}
      {...teil}
    />
  );
}

afterEach(() => unmount());

describe("BoxAnsicht — die Abgabe", () => {
  it("steht da, solange die Box aufnimmt", async () => {
    await mount(ansicht());
    expect(exists("[data-rolle='box-buchen']")).toBe(true);
  });

  it("verschwindet, wenn die Box stillgelegt ist", async () => {
    /*
     * ⚠️ DER BEFUND AUS DER CODEX-REVIEW ZU PR #175. Sie sichtbar zu lassen und
     * erst der Action widersprechen zu lassen hiesse: Einheit waehlen, Artikel
     * waehlen, Menge tippen, klicken — und dann die Ablehnung lesen. Ein
     * Bedienelement, das nie zum Ziel fuehrt, ist schlimmer als keins.
     */
    await mount(ansicht({ nimmtAuf: false }));
    expect(exists("[data-rolle='box-buchen']")).toBe(false);
  });

  it("zeigt den INHALT auch dann weiter — ausräumen soll man die Kiste ja", async () => {
    await mount(ansicht({ nimmtAuf: false }));
    expect(document.body.textContent).toContain("Kühlkompresse");
    expect(document.body.textContent).toContain("RTW 1 · Fahrzeug · MS-DRK-1");
  });
});

describe("BoxAnsicht — das Mengenfeld", () => {
  it("laesst keine Kommazahlen zu", () => {
    /*
     * ⚠️ QUELLTEXTLICH GEPRUEFT, UND DAS IST HIER DIE EINZIGE MOEGLICHKEIT:
     * `precision` ist eine Eigenschaft von antds `InputNumber`, die erst beim
     * TIPPEN wirkt — sie hinterlaesst im DOM kein Attribut, an dem eine Zusage
     * haengen koennte. Ohne sie besteht „1,5" die min/max-Probe des Feldes, der
     * Knopf bleibt aktiv, und erst `BoxSchema` weist es ab — mit „Die Eingabe
     * war unvollständig", einem Satz, der auf ein ausgefülltes Formular nicht
     * passt. Jedes andere Mengenfeld des Moduls setzt sie.
     */
    const q = readFileSync(QUELLE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).toMatch(/precision=\{0\}/);
  });

  it("deckelt die Menge bei `BUCHUNG_MENGE_MAX`, nicht erst am Bestand", () => {
    /*
     * ⚠️ ZWEI WAHRHEITEN WAEREN DER FEHLER (Codex-Review zu PR #175): der
     * Bestand ist die fachliche Grenze, `BUCHUNG_MENGE_MAX` die technische, und
     * `BoxSchema` weist alles darueber ab — mit „Die Eingabe war
     * unvollständig" an einem vollstaendig ausgefuellten Formular.
     *
     * ⚠️ QUELLTEXTLICH, WIE BEI `precision` DARUEBER, und aus einem verwandten
     * Grund: das Feld rendert erst, wenn im antd-`Select` ein Artikel gewaehlt
     * ist, und dessen Liste haengt in einem Portal ausserhalb des Wirts. Ein
     * DOM-Test dafuer pruefte die Bedienung des Selects, nicht den Deckel.
     * Die Wirkung selbst haelt `_ui/BoxAbgabe.test.tsx` am Helferweg fest —
     * dort laesst sich die Zahl wirklich eintippen — und `_actions` die
     * Serverseite.
     */
    const q = readFileSync(QUELLE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).toMatch(/Math\.min\(\s*aktiverPosten[\s\S]*?BUCHUNG_MENGE_MAX/);
  });

  it("bleibt bei der ARBEITSDICHTE — kein `size` an einem Bedienelement", () => {
    // Falle 4: `size="large"` ist 72px. Die Dichte kommt aus dem Theme.
    const q = readFileSync(QUELLE, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(q).not.toMatch(/\bsize="(large|small)"/);
  });
});

describe("BoxAnsicht — die Tabellen", () => {
  it("beschriftet beide Tabellen für Hilfstechnik", async () => {
    await mount(ansicht());
    expect(query("[aria-label='Inhalt Entnahmebox']")).toBeTruthy();
    expect(query("[aria-label='Zuletzt abgegeben']")).toBeTruthy();
  });

  it("schreibt den Verfallsstatus in den Chargen-Chip, statt ihn zu faerben", async () => {
    /*
     * ⚠️ DIE FARBE IST KEINE AUSKUNFT (Codex-Review zu PR #175). Wer die Kiste
     * einraeumt, entscheidet an genau diesem Chip, ob das Teil zurueck ins
     * Regal geht oder in den Muell — und „01/27" allein beantwortet das nicht.
     * Bis hierher stand die Antwort nur im Ton und war mit Rot-Gruen-Schwaeche
     * oder einer Vorleseanwendung nicht zu haben.
     */
    await mount(ansicht({
      inhalt: [{
        ...POSTEN[0]!,
        chargen: [{
          id: "ch-alt", chargenNr: "L-099", verfall: "2026-01", rest: 3,
          ampel: "rot", text: "abgelaufen",
        }],
      }],
    }));
    expect(document.body.textContent).toContain("L-099 · abgelaufen · 3");
  });

  it("stellt die GEMELDETE Angabe neben die Chargen — DRK-377", async () => {
    /*
     * ⚠️ DER FALL, DER DAS TICKET AUSGELOEST HAT, IN EINER ZEILE: die Charge
     * ist eine Pseudo-Charge („bis 12/99", also Entwarnung), und fuer dasselbe
     * Material ist 05/26 gemeldet. Wer nur die Chargenspalte liest, legt
     * abgelaufenes Material zurueck ins Regal.
     */
    await mount(ansicht({
      inhalt: [{
        ...POSTEN[0]!,
        chargen: [{
          id: "ch-pseudo", chargenNr: "Korrektur", verfall: "2099-12", rest: 6,
          ampel: "gruen", text: "bis 12/99",
        }],
        gemeldet: { verfall: "2026-05", ampel: "rot", abgelaufen: true, text: "abgelaufen" },
      }],
    }));
    expect(document.body.textContent).toContain("Korrektur · bis 12/99 · 6");
    expect(document.body.textContent).toContain("abgelaufen");
  });

  it("setzt einen Strich, wo nichts gemeldet ist — keine leere Zelle", async () => {
    // „Dazu liegt keine Meldung vor" ist eine Auskunft; eine leere Zelle neben
    // gefuellten liest sich als vergessene Angabe.
    await mount(ansicht());
    expect(query("[aria-label='Inhalt Entnahmebox']")!.textContent).toContain("—");
  });

  it("zeigt einen Strich statt einer rohen Id, wenn die Herkunft fehlt", async () => {
    // Die Referenz trägt keinen Fremdschlüssel; eine gelöschte Einheit
    // hinterlässt sie als Waise. Eine Zeichenkette, die wie ein Name aussieht
    // und keiner ist, wäre schlimmer als ein Strich.
    await mount(ansicht({ zugaenge: [{ ...ZUGAENGE[0]!, herkunft: null }] }));
    expect(document.body.textContent).toContain("—");
  });
});
