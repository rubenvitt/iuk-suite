// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * Das Harness selbst hat sonst keine Tests — die sechs Testdateien, die es
 * benutzen, pruefen es implizit mit. Diese eine Zusage ist aber nicht implizit
 * geprueft: `unmount()` raeumt Portal-Reste (Drawer, Modal.confirm, ...) aus
 * `document.body` weg, und das darf nicht zu grob geraten. Eine fruehere
 * Fassung entfernte pauschal ALLES außer dem Mount-Wirt — das haette auch
 * Fixtures geloescht, die ein Test absichtlich vor dem Mount dort ablegt.
 */
describe("unmount() raeumt nur, was seit dem Mount dazukam", () => {
  afterEach(() => {
    document.querySelector('[data-testid="fixture"]')?.remove();
  });

  it("laesst einen vor dem Mount abgelegten Knoten in document.body stehen", async () => {
    const fixture = document.createElement("div");
    fixture.dataset.testid = "fixture";
    document.body.appendChild(fixture);

    await mount(<div>Inhalt</div>);
    await unmount();

    expect(document.querySelector('[data-testid="fixture"]')).not.toBeNull();
  });
});
