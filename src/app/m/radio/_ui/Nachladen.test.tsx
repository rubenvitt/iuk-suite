// @vitest-environment jsdom
// src/app/m/radio/_ui/Nachladen.test.tsx
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, exists, mount, query, queryAll, rerender, unmount } from "../../qr/_lib/test-dom";
import type { NachladeAntwort } from "../_lib/nachladen";
import { NachladeFuss, useNachladen } from "./Nachladen";

/**
 * DAS NACHLADEN BEIM SCROLLEN (DRK-335) — der Hook ohne Tabelle darum.
 *
 * ⚠️ WAS DIESE DATEI PRUEFT, IST DIE VERDRAHTUNG, NICHT DIE SICHTBARKEIT: jsdom rechnet keine
 * Layoutboxen, nichts kommt je „in Sicht". Der Stummel unten meldet den Treffer auf Zuruf. Dass
 * die Wache im echten Browser in Sicht kommt, kann nur Playwright sagen. Vorbild ist
 * `lagerbuch/verwaltung/(arbeit)/journal/JournalTable.test.tsx`.
 */

type Zeile = { id: string };
type Cursor = { nach: string };
type Aktion = (anfrage: {
  parameter: Record<string, string>;
  cursor: Cursor;
}) => Promise<NachladeAntwort<Zeile, Cursor>>;

const FEHLER = "Weitere Dinge konnten nicht geladen werden.";

function Liste({
  ersteZeilen,
  ersterCursor,
  gesamt,
  parameter,
  aktion,
}: {
  ersteZeilen: Zeile[];
  ersterCursor: Cursor | null;
  gesamt: number;
  parameter: Record<string, string>;
  aktion: Aktion;
}) {
  const nachladen = useNachladen<Zeile, Cursor>({
    ersteZeilen,
    ersterCursor,
    gesamt,
    parameter,
    aktion,
    fehlerText: FEHLER,
  });
  return (
    <>
      <ul>
        {nachladen.zeilen.map((z) => (
          <li key={z.id} data-id={z.id} />
        ))}
      </ul>
      <NachladeFuss
        nachladen={nachladen}
        woerter={{ einzahl: "Ding", mehrzahl: "Dinge", dativ: "Dingen" }}
      />
    </>
  );
}

function ids(): Array<string | null> {
  return queryAll("li").map((li) => li.getAttribute("data-id"));
}

function stand(): string {
  return exists('[data-rolle="radio-nachladen-stand"]')
    ? query('[data-rolle="radio-nachladen-stand"]').textContent ?? ""
    : "";
}

/** Ein Beobachter, der auf Zuruf „in Sicht" meldet — jsdom kennt keinen eigenen. */
function beobachterStellen(): { ausloesen: () => void; beobachtet: () => boolean } {
  let melden: (() => void) | null = null;
  class Stummel {
    constructor(private rueckruf: IntersectionObserverCallback) {
      melden = () =>
        this.rueckruf(
          [{ isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
    }
    observe() {}
    disconnect() {
      melden = null;
    }
    unobserve() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = "";
    thresholds = [];
  }
  vi.stubGlobal("IntersectionObserver", Stummel);
  return { ausloesen: () => melden?.(), beobachtet: () => melden !== null };
}

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("useNachladen", () => {
  it("haengt die naechste Portion an und fuehrt Stand und Gesamtzahl nach", async () => {
    const { ausloesen } = beobachterStellen();
    const aktion = vi.fn<Aktion>().mockResolvedValue({
      ok: true,
      zeilen: [{ id: "c" }, { id: "d" }],
      cursor: null,
      gesamt: 5,
    });
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }, { id: "b" }]}
        ersterCursor={{ nach: "b" }}
        gesamt={4}
        parameter={{ q: "x" }}
        aktion={aktion}
      />,
    );
    expect(stand()).toBe("2 von 4 Dingen geladen – weitere beim Scrollen");

    await act(async () => ausloesen());
    await warte();

    expect(aktion).toHaveBeenCalledWith({ parameter: { q: "x" }, cursor: { nach: "b" } });
    expect(ids()).toEqual(["a", "b", "c", "d"]);
    // Die Zahl kommt aus der ANTWORT — sie lebt, statt auf dem ersten Aufruf zu stehen.
    expect(stand()).toBe("5 Dinge");
  });

  it("nennt die Einzahl, wenn genau ein Eintrag da ist", async () => {
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }]}
        ersterCursor={null}
        gesamt={1}
        parameter={{}}
        aktion={vi.fn<Aktion>()}
      />,
    );
    expect(stand()).toBe("1 Ding");
  });

  it("beobachtet nicht, wenn nichts mehr folgt", async () => {
    const { beobachtet } = beobachterStellen();
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }]}
        ersterCursor={null}
        gesamt={1}
        parameter={{}}
        aktion={vi.fn<Aktion>()}
      />,
    );
    expect(beobachtet()).toBe(false);
  });

  it("zaehlt eine doppelt gelieferte Zeile nicht zweimal", async () => {
    const { ausloesen } = beobachterStellen();
    const aktion = vi.fn<Aktion>().mockResolvedValue({
      ok: true,
      zeilen: [{ id: "b" }, { id: "c" }],
      cursor: null,
      gesamt: 3,
    });
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }, { id: "b" }]}
        ersterCursor={{ nach: "b" }}
        gesamt={3}
        parameter={{}}
        aktion={aktion}
      />,
    );
    await act(async () => ausloesen());
    await warte();
    expect(ids()).toEqual(["a", "b", "c"]);
  });

  it("bietet nach einem Fehler einen Knopf und laedt NICHT von selbst weiter", async () => {
    const { ausloesen, beobachtet } = beobachterStellen();
    const aktion = vi
      .fn<Aktion>()
      .mockResolvedValueOnce({ ok: false, fehler: "Satz der Action" })
      .mockResolvedValueOnce({ ok: true, zeilen: [{ id: "b" }], cursor: null, gesamt: 2 });
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }]}
        ersterCursor={{ nach: "a" }}
        gesamt={2}
        parameter={{}}
        aktion={aktion}
      />,
    );
    await act(async () => ausloesen());
    await warte();

    expect(document.body.textContent).toContain("Satz der Action");
    expect(beobachtet(), "nach einem Fehler beobachtet die Wache weiter").toBe(false);

    await click('[data-rolle="radio-nachladen-erneut"]');
    await warte();
    expect(aktion).toHaveBeenCalledTimes(2);
    expect(ids()).toEqual(["a", "b"]);
    expect(exists('[data-rolle="radio-nachladen-erneut"]')).toBe(false);
  });

  it("meldet den festen Satz, wenn die Action gar nicht antwortet", async () => {
    const { ausloesen } = beobachterStellen();
    const aktion = vi.fn<Aktion>().mockRejectedValue(new Error("Netz weg"));
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }]}
        ersterCursor={{ nach: "a" }}
        gesamt={2}
        parameter={{}}
        aktion={aktion}
      />,
    );
    await act(async () => ausloesen());
    await warte();
    expect(document.body.textContent).toContain(FEHLER);
    expect(document.body.textContent).not.toContain("Netz weg");
  });

  it("verwirft eine Antwort, die unter einem ANDEREN Filter losgeschickt wurde", async () => {
    /*
     * Das Rennen: der Filter wechselt, waehrend ein Nachschlag unterwegs ist. Der Abgleich in
     * der Renderphase laeuft zuerst — die eintreffende Antwort haengte sonst die Zeilen des
     * ALTEN Filters an den neuen Stand (DRK-331, Reviewbefund).
     */
    const { ausloesen } = beobachterStellen();
    let antworten!: (wert: NachladeAntwort<Zeile, Cursor>) => void;
    const aktion = vi
      .fn<Aktion>()
      .mockReturnValue(new Promise((fertig) => (antworten = fertig)));
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }]}
        ersterCursor={{ nach: "a" }}
        gesamt={9}
        parameter={{ status: "Defekt" }}
        aktion={aktion}
      />,
    );
    await act(async () => ausloesen());

    await rerender(
      <Liste
        ersteZeilen={[{ id: "neu" }]}
        ersterCursor={null}
        gesamt={1}
        parameter={{ status: "Wartung" }}
        aktion={aktion}
      />,
    );
    await act(async () => {
      antworten({ ok: true, zeilen: [{ id: "alt" }], cursor: { nach: "alt" }, gesamt: 9 });
    });
    await warte();

    expect(ids()).toEqual(["neu"]);
    expect(stand(), "der alte Stand hat Zahl oder Position ueberschrieben").toBe("1 Ding");
  });

  it("ein alter Nachschlag sperrt den ersten der NEUEN Generation nicht", async () => {
    /*
     * ⛔ DER BEOBACHTER MELDET NUR BEIM WECHSEL DER SICHTBARKEIT. Sperrte der alte, noch
     * laufende Abruf den neuen, bliebe die Liste nach dem Filterwechsel stehen, bis jemand
     * scrollt — die Wache ist ja schon in Sicht und meldet nichts mehr.
     */
    const { ausloesen } = beobachterStellen();
    const aktion = vi
      .fn<Aktion>()
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce({ ok: true, zeilen: [{ id: "n2" }], cursor: null, gesamt: 2 });
    await mount(
      <Liste
        ersteZeilen={[{ id: "a" }]}
        ersterCursor={{ nach: "a" }}
        gesamt={9}
        parameter={{ status: "Defekt" }}
        aktion={aktion}
      />,
    );
    await act(async () => ausloesen());
    await rerender(
      <Liste
        ersteZeilen={[{ id: "n1" }]}
        ersterCursor={{ nach: "n1" }}
        gesamt={2}
        parameter={{ status: "Wartung" }}
        aktion={aktion}
      />,
    );
    await act(async () => ausloesen());
    await warte();

    expect(aktion).toHaveBeenLastCalledWith({
      parameter: { status: "Wartung" },
      cursor: { nach: "n1" },
    });
    expect(ids()).toEqual(["n1", "n2"]);
  });

  it("setzt zurueck, wenn sich NUR der Filter aendert — bei gleicher erster Portion", async () => {
    /*
     * ⛔ DER FILTER GEHOERT IN DEN RUECKSETZ-SCHLUESSEL. Bleiben erste Zeile und Position gleich,
     * ergaebe ein Schluessel nur aus diesen beiden denselben Wert — und die nachgeladenen
     * Zeilen des alten Filters blieben stehen.
     */
    const { ausloesen } = beobachterStellen();
    const aktion = vi.fn<Aktion>().mockResolvedValue({
      ok: true,
      zeilen: [{ id: "b" }],
      cursor: { nach: "b" },
      gesamt: 5,
    });
    const erste = [{ id: "a" }];
    await mount(
      <Liste
        ersteZeilen={erste}
        ersterCursor={{ nach: "a" }}
        gesamt={5}
        parameter={{ q: "x" }}
        aktion={aktion}
      />,
    );
    await act(async () => ausloesen());
    await warte();
    expect(ids()).toEqual(["a", "b"]);

    await rerender(
      <Liste
        ersteZeilen={erste}
        ersterCursor={{ nach: "a" }}
        gesamt={5}
        parameter={{ q: "y" }}
        aktion={aktion}
      />,
    );
    expect(ids()).toEqual(["a"]);
  });
});
