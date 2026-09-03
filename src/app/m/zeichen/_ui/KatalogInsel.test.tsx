// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, unmount, query, queryAll, exists, fill, click } from "@/app/m/qr/_lib/test-dom";
import { alleZeichen, findeZeichen } from "../_lib/katalog";
import { AKTION_FEHLGESCHLAGEN } from "../_lib/aktionsfehler";

/*
 * DREI MOCKS, UND JEDER HAT EINEN GRUND.
 *
 * `next/navigation`: `useSearchParams` braucht einen echten App-Router-Kontext,
 * den jsdom + `mount()` nicht stellt (dieselbe Form wie `TagesWaehler.test.tsx`).
 * `useRouter().push` steht mit im Mock, damit der Test BEWEISEN kann, dass die
 * Insel NICHT navigiert.
 *
 * `next/link`: greift ebenfalls auf den Router-Kontext zu (Vorbild
 * `uav/_ui/teilnehmer/Dashboard.test.tsx`).
 *
 * `../actions`: die echten Actions zoegen `@/core/auth` und better-sqlite3 in
 * einen jsdom-Lauf; geprueft wird hier ohnehin nur, DASS die Insel die richtige
 * Action mit der richtigen Id ruft.
 */
const pushMock = vi.fn();
const merkeMock = vi.fn<(id: string) => Promise<void>>(async () => {});
const entferneMock = vi.fn<(id: string) => Promise<void>>(async () => {});
let suchparameter = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/m/zeichen/katalog",
  useSearchParams: () => suchparameter,
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("../actions", () => ({
  merkeZeichen: (id: string) => merkeMock(id),
  entferneZeichen: (id: string) => entferneMock(id),
}));

const { KatalogInsel } = await import("./KatalogInsel");

const ERSTE = alleZeichen()[0];
if (ERSTE === undefined) throw new Error("Das Generat ist leer — _lib/katalog.test.ts sagt, warum");

/*
 * EIN KAPITEL, DAS ZWEI ORGANISATIONEN FUEHRT — aus den Daten gesucht statt
 * geraten. Mit einem Kapitel, in dem alle Zeichen dieselbe Organisation tragen,
 * BEWIESE der Kombinationstest nichts: das Ergebnis waere mit und ohne den
 * zweiten Filter identisch. Faellt hier nichts an, ist das ein Befund und kein
 * Testfehler — dann kann diese Flaeche zwei Filter gar nicht sinnvoll kombinieren.
 */
const KOMBI = (() => {
  for (const z of alleZeichen()) {
    if (z.organisation === null) continue;
    const imKapitel = alleZeichen().filter((k) => k.kapitel === z.kapitel);
    if (imKapitel.length > 48) continue; // sonst schneidet die Raster-Schranke mit
    const beides = imKapitel.filter((k) => k.organisation === z.organisation);
    if (beides.length > 0 && beides.length < imKapitel.length) {
      return { kapitel: z.kapitel, organisation: z.organisation, beides: beides.length };
    }
  }
  throw new Error("Kein Kapitel des Generats fuehrt zwei Organisationen — der Test bewiese nichts");
})();

/**
 * ⚠️ NATIVE AUSWAHLFELDER BRAUCHEN `change`, NICHT `input`.
 *
 * `fill()` aus `qr/_lib/test-dom.tsx` verschickt ein `input`-Ereignis; React
 * bindet `onChange` fuer `<select>` aber an das native `change`-Ereignis. Mit
 * `fill()` feuerte der Handler NIE, die Filter blieben leer, und der Test maesse
 * zweimal dieselbe Trefferzahl — gruen, ohne etwas zu pruefen. Vorbild fuer
 * diesen Helfer: `qr/admin/preset-form.test.tsx:29-36`.
 */
async function waehle(selektor: string, wert: string): Promise<void> {
  const el = query<HTMLSelectElement>(selektor);
  const setzer = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (!setzer) throw new Error("Kein value-Setter am HTMLSelectElement-Prototyp");
  await act(async () => {
    setzer.call(el, wert);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function kachelIds(): string[] {
  return queryAll('[data-testid^="zeichen-kachel-"]').map((k) =>
    k.getAttribute("data-testid")!.slice("zeichen-kachel-".length),
  );
}

beforeEach(() => {
  suchparameter = new URLSearchParams();
  window.history.replaceState(null, "", "http://localhost:3000/katalog");
  pushMock.mockClear();
  merkeMock.mockClear();
  entferneMock.mockClear();
});

afterEach(async () => {
  await unmount();
});

describe("KatalogInsel — Suche und Filter", () => {
  /*
   * DIE FALTUNG TRAEGT BIS IN DIE OBERFLAECHE. Gemessen findet „loeschgruppe" mit
   * reiner Kleinschreibung 0 von 232 Zeichen; wer auf einem Tablet mit
   * Handschuhen tippt, schreibt keine Umlaute. Dieser Test prueft die
   * VERDRAHTUNG — dass die Eingabe ueberhaupt bei `sucheZeichen` ankommt —, nicht
   * die Faltung selbst (das tut `_lib/falte.test.ts`).
   */
  it("die Suche filtert das Raster, und loeschgruppe findet Loeschgruppe", async () => {
    await mount(<KatalogInsel />);
    const vorher = kachelIds().length;
    expect(vorher).toBeGreaterThan(0);

    await fill('[data-testid="zeichen-suche"]', "loeschgruppe");

    const nachher = kachelIds();
    expect(nachher.length).toBeGreaterThan(0);
    expect(nachher.length).toBeLessThan(vorher);
    for (const id of nachher) {
      expect(findeZeichen(id)?.suchtext, id).toContain("loeschgruppe");
    }
  });

  /*
   * ZWEI FILTER SCHNEIDEN SICH, SIE ADDIEREN SICH NICHT. Der naheliegende Fehler
   * ist ein `||` statt eines `&&` in der Filterkette — mit nur EINEM gesetzten
   * Filter waere er ununterscheidbar vom richtigen Verhalten.
   */
  it("Kapitel und Organisation kombinieren sich zu einer Schnittmenge", async () => {
    await mount(<KatalogInsel />);
    await waehle('[data-testid="zeichen-filter-kapitel"]', KOMBI.kapitel);
    const nurKapitel = kachelIds().length;

    await waehle('[data-testid="zeichen-filter-organisation"]', KOMBI.organisation);
    const beides = kachelIds();

    expect(beides.length).toBe(KOMBI.beides);
    expect(beides.length).toBeLessThan(nurKapitel);
    for (const id of beides) {
      const z = findeZeichen(id);
      expect(z?.kapitel, id).toBe(KOMBI.kapitel);
      expect(z?.organisation, id).toBe(KOMBI.organisation);
    }
  });

  it("sagt bei null Treffern, was zu tun ist, statt nur „nichts da“", async () => {
    await mount(<KatalogInsel />);
    await fill('[data-testid="zeichen-suche"]', "zzzgibtesnicht");
    expect(kachelIds()).toHaveLength(0);
    expect(document.body.textContent).toContain("Weniger Wörter");
  });
});

describe("KatalogInsel — der Detailbereich liegt auf DERSELBEN Seite", () => {
  it("?z=<id> oeffnet ihn beim ersten Rendern, ohne jede Navigation", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel />);
    const detail = query('[data-testid="zeichen-detailbereich"]');
    expect(detail.textContent).toContain(ERSTE.titel);
    expect(detail.textContent).toContain(ERSTE.bedeutung);
    expect(pushMock).not.toHaveBeenCalled();
  });

  /*
   * ⛔ KEIN router.push. Auf `/offline` ist genau EINE Navigationsroute gecacht;
   * ein `push` loeste dort einen RSC-Abruf aus, den es ohne Netz nicht gibt, und
   * der Navigationsrueckfall lieferte dieselbe Flaeche noch einmal aus. Die
   * Adresszeile wird deshalb mit `history.replaceState` nachgezogen — EIN
   * Codepfad fuer online und offline.
   */
  it("ein Klick auf eine Kachel oeffnet ihn und setzt ?z=, ohne zu navigieren", async () => {
    await mount(<KatalogInsel />);
    expect(exists('[data-testid="zeichen-detailbereich"]')).toBe(false);

    await click(`[data-testid="zeichen-kachel-${ERSTE.id}"]`);

    expect(query('[data-testid="zeichen-detailbereich"]').textContent).toContain(ERSTE.titel);
    expect(new URL(window.location.href).searchParams.get("z")).toBe(ERSTE.id);
    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe("KatalogInsel — Merken", () => {
  it("online traegt der Detailbereich den Merken-Knopf und den Weg zur Einzelseite", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel />);

    await click('[data-testid="zeichen-merken"]');
    expect(merkeMock).toHaveBeenCalledWith(ERSTE.id);

    const ziele = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(ziele).toContain(`/m/zeichen/katalog/${encodeURIComponent(ERSTE.id)}`);
  });

  it("ein bereits gemerktes Zeichen bietet das Entfernen an, nicht das Merken", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel gemerkt={[ERSTE.id]} />);

    expect(query('[data-testid="zeichen-merken"]').textContent).toContain("Aus der Merkliste");
    await click('[data-testid="zeichen-merken"]');
    expect(entferneMock).toHaveBeenCalledWith(ERSTE.id);
    expect(merkeMock).not.toHaveBeenCalled();
  });

  /*
   * DAS `offline`-PROP KANN GENAU ZWEI DINGE, UND BEIDE SIND MESSBAR BEGRUENDET:
   * (1) Schreiben braucht eine Verbindung — ein Knopf, der offline in einen
   *     Fehler laeuft, kostet an der Einsatzstelle genau die Zeit, um die es geht.
   * (2) `/katalog/[id]` ist NICHT im Cache. Der Navigationsrueckfall des Workers
   *     schickt jede nicht gecachte Navigation auf `/offline` — der Anwender
   *     landete auf derselben Flaeche und hielte das fuer einen Fehler.
   */
  it("offline gibt es weder Merken-Knopf noch Link auf die Einzelseite", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    await mount(<KatalogInsel offline />);

    expect(exists('[data-testid="zeichen-merken"]')).toBe(false);
    expect(queryAll("a")).toHaveLength(0);
    expect(query('[data-testid="zeichen-detailbereich"]').textContent).toContain(
      "Merken braucht eine Verbindung",
    );
  });
});

/*
 * KORREKTUR 9 DES AUFTRAGS: eine ABGEWIESENE Server Action zeigt einen Satz, sie
 * zerlegt keine Flaeche.
 *
 * Die Form aus Aufgabe 6 `await`ete in einer Transition OHNE `catch`; ein
 * `Forbidden` nach abgelaufener Sitzung nahm damit den ganzen Katalog mit. Der
 * Text steht in `_lib/aktionsfehler.ts` und ist fuer beide Inseln derselbe.
 */
describe("KatalogInsel — abgewiesene Aktion", () => {
  it("zeigt einen Satz und laesst die Flaeche stehen", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    merkeMock.mockRejectedValueOnce(new Error("Forbidden"));
    await mount(<KatalogInsel />);

    await click('[data-testid="zeichen-merken"]');

    expect(query('[data-testid="zeichen-aktionsfehler"]').textContent).toContain(
      AKTION_FEHLGESCHLAGEN,
    );
    expect(exists('[data-testid="zeichen-detailbereich"]')).toBe(true);
    // Der Knopf steht weiter auf „Merken": geschrieben wurde nichts.
    expect(query('[data-testid="zeichen-merken"]').textContent).toContain("Merken");
  });

  it("nimmt den Satz beim naechsten gelungenen Versuch zurueck", async () => {
    suchparameter = new URLSearchParams(`z=${ERSTE.id}`);
    merkeMock.mockRejectedValueOnce(new Error("Forbidden"));
    await mount(<KatalogInsel />);

    await click('[data-testid="zeichen-merken"]');
    expect(exists('[data-testid="zeichen-aktionsfehler"]')).toBe(true);
    await click('[data-testid="zeichen-merken"]');
    expect(exists('[data-testid="zeichen-aktionsfehler"]')).toBe(false);
  });
});
