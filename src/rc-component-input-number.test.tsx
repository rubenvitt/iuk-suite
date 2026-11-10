// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { InputNumber } from "antd";

import { mount, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * Die Stepper eines Zahlenfeldes tragen deutsche Namen (IDA-392).
 *
 * `@rc-component/input-number` kodiert „Increase Value"/„Decrease Value" fest
 * ein; der Patch unter `patches/` ersetzt sie (Begruendung in
 * `pnpm-workspace.yaml`). Gemessen wird die WIRKUNG am gerenderten antd-Feld,
 * nicht der Patchtext: zieht ein antd-Upgrade eine andere Paketversion, ohne
 * dass pnpm den Patch verwaist meldet, faellt es hier auf.
 */

afterEach(async () => {
  await unmount();
});

function stepperNamen(): string[] {
  return Array.from(document.querySelectorAll(".ant-input-number [role='button']")).map(
    (knopf) => knopf.getAttribute("aria-label") ?? "",
  );
}

describe("@rc-component/input-number StepHandler", () => {
  it("benennt die Stepper deutsch", async () => {
    await mount(<InputNumber defaultValue={3} />);

    const namen = stepperNamen();
    expect(namen, "antd rendert keine Stepper mehr als role=button").toHaveLength(2);
    expect(namen).toEqual(expect.arrayContaining(["Wert erhöhen", "Wert verringern"]));
  });

  it("laesst keinen englischen Namen stehen", async () => {
    await mount(<InputNumber defaultValue={3} />);

    expect(document.body.innerHTML).not.toMatch(/Increase Value|Decrease Value/);
  });
});
