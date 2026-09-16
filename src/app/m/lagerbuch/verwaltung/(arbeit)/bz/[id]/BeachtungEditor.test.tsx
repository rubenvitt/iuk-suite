// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  click,
  exists,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../../_ui/verwaltung.module.css";
import { BeachtungEditor } from "./BeachtungEditor";

const mocks = vi.hoisted(() => ({ beachtungSetzen: vi.fn() }));

vi.mock("../../../../_actions/bz", () => ({
  beachtungSetzen: (...args: unknown[]) => mocks.beachtungSetzen(...args),
}));

/** Der Knopf mit genau diesem Text — antd rendert die Beschriftung in ein
 *  `<span>` im Knopf, ein Selektor ueber den Text geht deshalb nicht. */
function knopf(text: string): HTMLButtonElement | undefined {
  return queryAll<HTMLButtonElement>("button")
    .find((b) => b.textContent?.trim() === text);
}

/** Die Action laeuft in einer Transition — ein Tick reicht, damit der
 *  aufgeloeste Zustand im DOM steht. */
async function warteAufAction(): Promise<void> {
  await new Promise((fertig) => setTimeout(fertig, 0));
}

beforeEach(() => {
  mocks.beachtungSetzen.mockResolvedValue({ ok: true, wert: { erforderlich: true } });
});

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

describe("BeachtungEditor ohne laufende Beachtung", () => {
  it("erklärt den Zustand und bietet nur das Setzen an", async () => {
    await mount(<BeachtungEditor geraetId="bz-1" hinweis={null} seitText={null} />);

    expect(document.body.textContent).toContain("Für dieses Gerät ist nichts zu beachten.");
    expect(knopf("Beachtung setzen")).toBeDefined();
    // ⚠️ KEIN Aufheben-Knopf: es gibt nichts aufzuheben, und ein gesperrter
    // Knopf laesst offen, ob gerade etwas steht oder nicht.
    expect(knopf("Beachtung aufheben")).toBeUndefined();
    expect(exists(`.${s.chip}`)).toBe(false);
  });

  /**
   * ⚠️ DER RIEGEL GEGEN DEN GELBEN STATUS OHNE BEGRUENDUNG — und er sitzt hier
   * ZUSAETZLICH zur Action. Hier, damit niemand erst nach dem Absenden erfaehrt,
   * dass ein Wort fehlt; dort, weil die Oberflaeche keine Zusage ist.
   *
   * ⚠️ Der Knopf ist GESPERRT, statt einen leeren Hinweis zu senden: ein leerer
   * Text HEBT in der Action AUF — „Beachtung setzen" haette bei leerem Feld
   * also die Gegenbedeutung seiner Beschriftung.
   */
  it("sperrt das Setzen, solange kein Hinweis dasteht", async () => {
    await mount(<BeachtungEditor geraetId="bz-1" hinweis={null} seitText={null} />);

    expect(knopf("Beachtung setzen")?.disabled).toBe(true);
    await fill("input[aria-label='Hinweis zur Beachtung']", "   ");
    expect(knopf("Beachtung setzen")?.disabled).toBe(true);

    await fill("input[aria-label='Hinweis zur Beachtung']", "Display flackert");
    expect(knopf("Beachtung setzen")?.disabled).toBe(false);
  });

  it("schickt den Hinweis an die Action", async () => {
    await mount(<BeachtungEditor geraetId="bz-1" hinweis={null} seitText={null} />);

    await fill("input[aria-label='Hinweis zur Beachtung']", "Display flackert");
    await click("button.ant-btn-primary");
    await warteAufAction();

    expect(mocks.beachtungSetzen).toHaveBeenCalledWith({
      geraetId: "bz-1",
      hinweis: "Display flackert",
    });
  });
});

describe("BeachtungEditor mit laufender Beachtung", () => {
  it("zeigt Hinweis und Standzeit und bietet das Aufheben an", async () => {
    await mount(
      <BeachtungEditor
        geraetId="bz-1"
        hinweis="Display flackert"
        seitText="seit 08.07. 09:15"
      />,
    );

    /*
     * ⚠️ DER CHIP IST DER STATUS, DER TEXT DANEBEN DER HINWEIS (Reviewrunde 2).
     * `.chip` traegt `white-space: nowrap` — stuende der Hinweis darin, waere
     * ein langer Satz eine einzige unbrechbare Zeile und liefe aus der Karte.
     */
    expect(query(`.${s.chip}`).textContent).toContain("beachten");
    expect(document.body.textContent).toContain("Display flackert");
    expect(document.body.textContent).toContain("seit 08.07. 09:15");
    // Das Feld ist vorbelegt — wer nur praeziser formulieren will, tippt den
    // Satz nicht neu.
    expect(query<HTMLInputElement>("input[aria-label='Hinweis zur Beachtung']").value)
      .toBe("Display flackert");
    expect(knopf("Hinweis speichern")).toBeDefined();
    expect(knopf("Beachtung aufheben")).toBeDefined();
  });

  /** ⚠️ Der LEERE Hinweis ist das Aufheben — genau das schickt der Knopf. */
  it("hebt mit leerem Hinweis auf", async () => {
    mocks.beachtungSetzen.mockResolvedValue({ ok: true, wert: { erforderlich: false } });
    await mount(
      <BeachtungEditor geraetId="bz-1" hinweis="Display flackert" seitText={null} />,
    );

    const aufheben = knopf("Beachtung aufheben")!;
    aufheben.click();
    await warteAufAction();

    expect(mocks.beachtungSetzen).toHaveBeenCalledWith({ geraetId: "bz-1", hinweis: "" });
  });

  it("zeigt den Satz der Action, wenn das Speichern scheitert", async () => {
    mocks.beachtungSetzen.mockResolvedValue({ ok: false, fehler: "BZ-Gerät nicht gefunden." });
    await mount(
      <BeachtungEditor geraetId="bz-1" hinweis="Display flackert" seitText={null} />,
    );

    await click("button.ant-btn-primary");
    await warteAufAction();

    expect(query("[role='alert']").textContent).toContain("BZ-Gerät nicht gefunden.");
  });

  it("meldet auch einen geworfenen Fehler als Satz statt als leere Fläche", async () => {
    mocks.beachtungSetzen.mockRejectedValue(new Error("Netz weg"));
    await mount(
      <BeachtungEditor geraetId="bz-1" hinweis="Display flackert" seitText={null} />,
    );

    await click("button.ant-btn-primary");
    await warteAufAction();

    const meldung = query("[role='alert']").textContent ?? "";
    expect(meldung).toContain("Beachtung konnte nicht gespeichert werden.");
    // Der interne Fehlertext gehört nicht auf den Schirm.
    expect(meldung).not.toContain("Netz weg");
  });
});
