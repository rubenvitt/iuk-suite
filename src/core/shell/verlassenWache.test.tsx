// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "antd";

import { existsPortal, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { offeneSperre, verlassenBestaetigt } from "@/core/shell/verlassen";
import { useVerlassenSperre, useVerlassenWache } from "@/core/shell/verlassenWache";

const SPERRE = { titel: "Speicherkonflikt offen", text: "Weg ist weg." };

function Probe({ gesperrt, gefolgt }: { gesperrt: boolean; gefolgt: () => void }) {
  useVerlassenSperre(gesperrt ? { ...SPERRE } : null);
  const { beiKlick } = useVerlassenWache();
  return (
    <div onClickCapture={beiKlick}>
      <a href="#ziel" data-testid="ziel" onClick={(e) => { e.preventDefault(); gefolgt(); }}>
        <span data-testid="innen">Ziel</span>
      </a>
      <a href="#frei" data-testid="frei" data-verlassen-frei="" onClick={(e) => { e.preventDefault(); gefolgt(); }}>Frei</a>
    </div>
  );
}

const zeige = (gesperrt: boolean, gefolgt = vi.fn()) => mount(<App><Probe gesperrt={gesperrt} gefolgt={gefolgt} /></App>);

async function klicke(el: Element, mehr: MouseEventInit = {}): Promise<boolean> {
  let durch = true;
  await act(async () => {
    durch = el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...mehr }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return durch;
}
const knopf = (text: string) => [...document.querySelectorAll<HTMLButtonElement>(".ant-modal-confirm button")].find((b) => b.textContent === text)!;
const dialogOffen = () => existsPortal(".ant-modal-confirm") && document.querySelector(".ant-modal-confirm-title")?.textContent === SPERRE.titel;

afterEach(async () => {
  await unmount();
});

describe("useVerlassenWache (IDA-357)", () => {
  it("lässt ohne Sperre jeden Klick durch", async () => {
    const gefolgt = vi.fn();
    await zeige(false, gefolgt);
    await klicke(query('[data-testid="ziel"]'));
    expect(gefolgt).toHaveBeenCalledTimes(1);
    expect(existsPortal(".ant-modal-confirm")).toBe(false);
  });

  it("hält mit Sperre den Klick an und fragt; „Bleiben“ bleibt", async () => {
    const gefolgt = vi.fn();
    await zeige(true, gefolgt);
    expect(offeneSperre()).toEqual(SPERRE);
    const durch = await klicke(query('[data-testid="innen"]'));
    expect(durch).toBe(false);
    expect(gefolgt).not.toHaveBeenCalled();
    expect(dialogOffen()).toBe(true);
    expect(document.querySelector(".ant-modal-confirm-content")?.textContent).toBe(SPERRE.text);
    expect(document.activeElement).toBe(knopf("Bleiben"));
    await klicke(knopf("Bleiben"));
    expect(gefolgt).not.toHaveBeenCalled();
    expect(verlassenBestaetigt()).toBe(false);
  });

  it("„Trotzdem verlassen“ klickt denselben Link noch einmal und bestätigt", async () => {
    const gefolgt = vi.fn();
    await zeige(true, gefolgt);
    await klicke(query('[data-testid="ziel"]'));
    await klicke(knopf("Trotzdem verlassen"));
    expect(gefolgt).toHaveBeenCalledTimes(1);
    expect(verlassenBestaetigt()).toBe(true);
  });

  it("lässt neuen Tab und freigegebene Links durch", async () => {
    const gefolgt = vi.fn();
    await zeige(true, gefolgt);
    await klicke(query('[data-testid="ziel"]'), { ctrlKey: true });
    await klicke(query('[data-testid="frei"]'));
    expect(gefolgt).toHaveBeenCalledTimes(2);
    expect(existsPortal(".ant-modal-confirm")).toBe(false);
  });

  it("hebt die Sperre beim Abbau auf", async () => {
    await zeige(true);
    await unmount();
    expect(offeneSperre()).toBeNull();
  });
});
