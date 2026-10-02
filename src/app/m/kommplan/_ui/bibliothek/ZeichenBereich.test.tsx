// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, queryAll, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import type { EigenesZeichen } from "../../_lib/zeichen/eigen/typen";

const aktion = vi.hoisted(() => ({ speichere: vi.fn(), loesche: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../_actions/eigeneZeichen", () => ({ speichereEigenesZeichenAction: aktion.speichere, loescheEigenesZeichenAction: aktion.loesche }));
vi.mock("../../_actions/bibliothek", () => ({}));
vi.mock("../../_actions/zeichen", () => ({ ladeZeichenAction: vi.fn(async () => ({})) }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { Bibliothek } from "./Bibliothek";

const ID = "8f1c2c1e-0000-4000-8000-000000000001";
const ILS: EigenesZeichen = {
  id: ID, schluessel: `eigen:${ID}`, titel: "ILS Schweinfurt", nutzung: 2, beschreibung: "Grundzeichen: Funktionsstelle. Kürzel: ILS.",
  spec: { kind: "post", organization: "fuehrung-leitung", labels: { center: "ILS", bottomRight: "SW" } } as SymbolSpec,
};
const LEER = { stellen: [], einheiten: [], verbindungen: [] };
/** Der Baukasten kommt per `import()` — warten, bis seine Vorschau steht. */
async function baukastenDa() {
  for (let i = 0; i < 50 && !document.querySelector(".kp-flyin .kp-baukasten-vorschau"); i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  }
  return queryPortal(".kp-flyin .kp-baukasten-vorschau");
}
const knopf = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role='tab']")].find((b) => b.textContent?.trim() === text)!;
async function fillPortal(selektor: string, wert: string) {
  const feld = queryPortal<HTMLInputElement>(selektor);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(feld), "value")!.set!;
  await act(async () => { setter.call(feld, wert); feld.dispatchEvent(new Event("input", { bubbles: true })); });
}
const zeige = (zeichen: EigenesZeichen[] = [ILS]) =>
  mount(<Bibliothek bibliothek={LEER} eigeneZeichen={zeichen} zeichenIndex={[]} symbole={{}} reiter="zeichen" />);

beforeEach(() => { Object.values(aktion).forEach((f) => f.mockReset()); router.refresh.mockReset(); });
afterEach(async () => { await unmount(); });

describe("Bibliothek — eigene Zeichen", () => {
  it("?reiter=zeichen öffnet den Reiter; die Liste nennt Name, Bedeutung und wie viele Pläne das Zeichen nutzen", async () => {
    await zeige();
    expect(query('[role="tab"][aria-selected="true"]').textContent).toBe("Zeichen (1)");
    const zeile = query(`section[aria-label="Eigene Zeichen"] tr[data-row-key="${ID}"]`);
    expect(zeile.textContent).toContain("ILS Schweinfurt");
    expect(zeile.textContent).toContain("Kürzel: ILS");
    expect(zeile.textContent).toContain("2");
  });
  it("leer: sagt, wofür der Reiter da ist", async () => {
    await zeige([]);
    expect(query('section[aria-label="Eigene Zeichen"]').textContent).toContain("etwa für eine Leitstelle");
  });
  it("Neues Zeichen: Baukasten zeichnet die Vorschau im Browser (Kürzel schwarz auf Gelb); gespeichert wird nur die Zusammenstellung", async () => {
    aktion.speichere.mockResolvedValue({ ok: true, id: ID, schluessel: `eigen:${ID}`, titel: "ILS Würzburg" });
    await zeige([]);
    await clickElement(knopf("Neues Zeichen"));
    const vorschau = await baukastenDa();
    expect(vorschau.querySelector(":scope > svg")!.innerHTML).toMatch(/fill="#000000">ILS<\/text>/);
    await fillPortal('.kp-flyin input[name="titel"]', "ILS Würzburg");
    const unten = [...document.querySelectorAll<HTMLLabelElement>(".kp-flyin label")].find((l) => l.textContent === "Unten rechts")!;
    await fillPortal(`#${CSS.escape(unten.htmlFor)}`, "WÜ");
    expect(queryPortal(".kp-flyin .kp-baukasten-vorschau > svg").innerHTML).toContain(">WÜ</text>");
    await act(async () => { queryPortal<HTMLFormElement>('.kp-flyin form[aria-label="Eigenes Zeichen"]').dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(aktion.speichere).toHaveBeenCalledWith({
      id: null, titel: "ILS Würzburg",
      spec: { kind: "post", organization: "fuehrung-leitung", labels: { center: "ILS", bottomRight: "WÜ" } },
    });
    expect(query('section[aria-label="Eigene Zeichen"] [role="status"]').textContent).toContain("„ILS Würzburg“ gespeichert.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("ein zu langer Text sperrt keine Auswahl, sondern steht als Hinweis an der Vorschau", async () => {
    await zeige([]);
    await clickElement(knopf("Neues Zeichen"));
    await baukastenDa();
    const mitte = [...document.querySelectorAll<HTMLLabelElement>(".kp-flyin label")].find((l) => l.textContent === "Mitte")!;
    await fillPortal(`#${CSS.escape(mitte.htmlFor)}`, "Integrierte Leitstelle");
    expect(queryPortal(".kp-flyin .kp-baukasten-vorschau .ant-alert-warning").textContent).toMatch(/\S/);
    expect(document.querySelector(".kp-flyin .kp-baukasten-vorschau > svg")).toBeNull();
    expect(document.querySelectorAll(".kp-flyin .ant-select-disabled")).toHaveLength(0);
  });
  it("Bearbeiten zeigt die gespeicherte Zusammenstellung; Löschen nennt die Pläne, die das Zeichen nutzen", async () => {
    aktion.loesche.mockResolvedValue({ ok: true });
    await zeige();
    await clickElement(knopf("ILS Schweinfurt"));
    await baukastenDa();
    expect(queryPortal<HTMLInputElement>('.kp-flyin input[name="titel"]').value).toBe("ILS Schweinfurt");
    expect(document.body.textContent).toContain("Änderungen gelten sofort in allen 2 Plänen");
    await clickElement(knopf("Löschen"));
    expect(document.body.textContent).toContain("2 Pläne nutzen dieses Zeichen. Dort steht danach nur noch der Titel.");
    await clickElement([...document.querySelectorAll<HTMLElement>(".ant-popconfirm button, .ant-popover button")].find((b) => b.textContent?.trim() === "Löschen")!);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(aktion.loesche).toHaveBeenCalledWith({ id: ID });
    expect(queryAll('section[aria-label="Eigene Zeichen"] [role="status"]').map((e) => e.textContent)).toEqual(["„ILS Schweinfurt“ gelöscht."]);
  });
});
