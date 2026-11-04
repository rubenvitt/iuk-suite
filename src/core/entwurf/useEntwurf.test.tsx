// @vitest-environment jsdom
import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { SELBST_SENDEN_MS, ladeEntwurf, vergissFluechtig } from "./ablage";
import { useEntwurf } from "./useEntwurf";
import { useEntwurfMeldung } from "./useEntwurfMeldung";

/**
 * DIE ZUSAGE VON IDA-358: was getippt ist, übersteht Neuladen und gescheitertes
 * Absenden; gelöscht wird erst nach bestätigtem Erfolg. „Neuladen" ist hier ein
 * Abbau und Neuaufbau derselben Komponente — der Speicher ist derselbe wie im
 * Browser (`localStorage` von jsdom).
 */

type Antwort = { ok: boolean };
let senden: (n: { text: string }, id: string) => Promise<Antwort>;
let antworten: Antwort[] = [];
let neugeladen = 0;

function Formular() {
  const [text, setText] = useState("");
  const e = useEntwurf<{ text: string }, { text: string }, Antwort>({
    schluessel: "test:formular",
    stand: { text },
    wiederherstellen: (s) => setText(s.text),
    senden: (n, id) => senden(n, id),
    antwort: (r) => {
      antworten.push(r);
      return r.ok;
    },
    neuladen: () => {
      neugeladen += 1;
    },
  });
  const m = useEntwurfMeldung(e);
  return (
    <div>
      <input id="feld" value={text} onChange={(ev) => setText(ev.target.value)} />
      <button id="senden" onClick={() => e.sende({ text })}>Senden</button>
      <button id="verwerfen" onClick={e.verwerfen}>Verwerfen</button>
      <output id="zustand">{e.zustand}</output>
      <output id="meldung">{m?.text ?? ""}</output>
    </div>
  );
}

const gespeichert = () => ladeEntwurf<{ text: string }>("test:formular");

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  antworten = [];
  neugeladen = 0;
  senden = async () => ({ ok: true });
});
afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("useEntwurf", () => {
  it("legt jede Eingabe ab und stellt sie nach dem Neuladen wieder her", async () => {
    await mount(<Formular />);
    expect(gespeichert()).toBeNull();
    await fill("#feld", "Tupfer fehlt");
    expect(gespeichert()?.stand.text).toBe("Tupfer fehlt");

    await unmount();
    await mount(<Formular />);
    expect(query<HTMLInputElement>("#feld").value).toBe("Tupfer fehlt");
    expect(query("#meldung").textContent).toBe("Eingaben wiederhergestellt.");
    expect(gespeichert()?.stand.text).toBe("Tupfer fehlt");
  });

  it("löscht nach bestätigtem Erfolg", async () => {
    await mount(<Formular />);
    await fill("#feld", "x");
    await click("#senden");
    expect(antworten).toEqual([{ ok: true }]);
    expect(gespeichert()).toBeNull();
  });

  it("behält Eingaben bei einer Ablehnung und wiederholt sie nicht", async () => {
    senden = vi.fn(async () => ({ ok: false }));
    await mount(<Formular />);
    await fill("#feld", "x");
    await click("#senden");
    expect(senden).toHaveBeenCalledTimes(1);
    expect(gespeichert()?.stand.text).toBe("x");
    expect(gespeichert()?.sendung).toBeNull();
    expect(query("#zustand").textContent).toBe("ruhe");
  });

  it("wiederholt nach einem Wurf mit derselben Sendungs-ID, bis es ankommt", async () => {
    vi.useFakeTimers();
    const ids: string[] = [];
    let mal = 0;
    senden = async (_n, id) => {
      ids.push(id);
      mal += 1;
      if (mal < 3) throw new TypeError("Failed to fetch");
      return { ok: true };
    };
    await mount(<Formular />);
    await fill("#feld", "Braunüle");
    await click("#senden");
    expect(query("#zustand").textContent).toBe("wartet");
    expect(query("#meldung").textContent).toMatch(/^Nicht gesendet\. Neuer Versuch in \d+ s\.$/);
    expect(gespeichert()?.sendung?.nutzlast).toEqual({ text: "Braunüle" });

    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(query("#zustand").textContent).toBe("wartet");
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(mal).toBe(3);
    expect(new Set(ids).size).toBe(1);
    expect(antworten).toEqual([{ ok: true }]);
    expect(gespeichert()).toBeNull();
  });

  it("sendet eine liegende Sendung nach dem Neuladen von selbst", async () => {
    senden = async () => { throw new TypeError("Failed to fetch"); };
    await mount(<Formular />);
    await fill("#feld", "y");
    await click("#senden");
    const id = gespeichert()?.sendung?.id;
    expect(id).toBeTruthy();
    await unmount();

    const ids: string[] = [];
    senden = async (_n, i) => {
      ids.push(i);
      return { ok: true };
    };
    await mount(<Formular />);
    expect(ids).toEqual([id]);
    expect(gespeichert()).toBeNull();
  });

  it("sendet eine zu alte Sendung nicht von selbst, die Eingaben bleiben", async () => {
    senden = async () => { throw new TypeError("Failed to fetch"); };
    await mount(<Formular />);
    await fill("#feld", "alt");
    await click("#senden");
    await unmount();
    const e = gespeichert()!;
    localStorage.setItem("iuk-entwurf:test:formular", JSON.stringify({
      ...e, sendung: { ...e.sendung!, seit: Date.now() - SELBST_SENDEN_MS - 1 },
    }));
    vergissFluechtig();
    const s = vi.fn(async () => ({ ok: true }));
    senden = s;
    await mount(<Formular />);
    expect(s).not.toHaveBeenCalled();
    expect(query<HTMLInputElement>("#feld").value).toBe("alt");
    expect(query("#zustand").textContent).toBe("ruhe");
  });

  it("auch im offenen Tab geht eine zu alte Sendung nicht mehr von selbst raus", async () => {
    senden = async () => { throw new TypeError("Failed to fetch"); };
    await mount(<Formular />);
    await fill("#feld", "offen");
    await click("#senden");
    expect(query("#zustand").textContent).toBe("wartet");
    const s = vi.fn(async () => ({ ok: true }));
    senden = s;
    const jetzt = Date.now();
    const uhr = vi.spyOn(Date, "now").mockReturnValue(jetzt + SELBST_SENDEN_MS + 1);
    try {
      await act(async () => { window.dispatchEvent(new Event("online")); });
    } finally {
      uhr.mockRestore();
    }
    expect(s).not.toHaveBeenCalled();
    expect(query("#zustand").textContent).toBe("ruhe");
    expect(gespeichert()?.sendung).toBeNull();
    expect(query<HTMLInputElement>("#feld").value).toBe("offen");
  });

  it("lädt bei einer nach dem Rollout unbekannten Server Action einmal neu", async () => {
    senden = async () => {
      const e = new Error("not found");
      e.name = "UnrecognizedActionError";
      throw e;
    };
    await mount(<Formular />);
    await fill("#feld", "z");
    await click("#senden");
    expect(neugeladen).toBe(1);
    expect(gespeichert()?.sendung?.neugeladen).toBe(true);

    // Nach dem Neuladen derselbe Fehler: nicht noch einmal neu laden, sondern warten.
    await unmount();
    await mount(<Formular />);
    expect(neugeladen).toBe(1);
    expect(query("#zustand").textContent).toBe("wartet");
  });

  it("verwerfen setzt zurück und löscht", async () => {
    await mount(<Formular />);
    await fill("#feld", "weg");
    await click("#verwerfen");
    expect(query<HTMLInputElement>("#feld").value).toBe("");
    expect(gespeichert()).toBeNull();
  });
});
